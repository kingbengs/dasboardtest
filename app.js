require('dotenv').config();
// require from root (absolute path)
global.requireRoot = require('app-root-path').require;

const express = require('express');
const os = require('os');
const cluster = require('cluster');
const sio = require('socket.io');
const net = require('net');
const farmhash = require('farmhash');
const redis = require('redis');
const redisAdapter = require('socket.io-redis');
const path = require('path');
const bodyParser = require('body-parser');
const jwt = require('express-jwt');
const cors = require('cors');
const { errors: { AppError } } = require('@funnelytics/shared-data');
const recursive = require('recursive-readdir');
const util = require('util');
const _ = require('lodash');
const AWS = require('aws-sdk');
const moment = require('moment');
const RequestUtil = require('./lib/requests/RequestUtil');

// const initFunnelsSocketsNamespace = require('./sockets/funnels');

const app = express();
const router = express.Router();
const Firehose = new AWS.Firehose({
  region: 'ca-central-1',
  accessKeyId: process.env.TRACKING_AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.TRACKING_AWS_SECRET_ACCESS_KEY,
});

app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization', 'X-Project-Id'],
  credentials: true,
}));

app.use(jwt({
  secret: process.env.TOKEN_SECRET,
}).unless({
  path: [{
    url: '/analytics-ranges/admin',
    methods: ['POST'],
  }, {
    url: '/auth',
    methods: ['POST'],
  }, {
    url: '/users',
    methods: ['POST'],
  }, {
    url: '/users/create',
    methods: ['POST'],
  }, {
    url: '/users/create-by-email',
    methods: ['POST'],
  }, {
    url: '/trackers/start',
    methods: ['GET', 'POST'],
  }, {
    url: '/trackers/step',
    methods: ['GET', 'POST'],
  }, {
    url: '/trackers/set',
    methods: ['POST'],
  }, {
    url: '/events/trigger',
    methods: ['POST'],
  }, {
    url: '/assets/scripts/track.js',
    methods: ['GET'],
  }, {
    url: '/trackers/activecampaign',
    methods: ['POST'],
  }, {
    url: '/funnel_webhooks/test',
    methods: ['POST'],
  }, {
    url: '/password-resets',
    methods: ['POST'],
  }, {
    url: /\/password-resets\/.+/,
    methods: ['GET', 'PATCH'],
  },
  {
    url: '/purchases/external',
    methods: ['POST'],
  },
  {
    url: '/webhooks/stripe-order-payment-succeeded',
    methods: ['POST'],
  },
  {
    url: '/webhooks/stripe-order-charge-succeeded',
    methods: ['POST'],
  },
  {
    url: '/webhooks/woo-subscription',
    methods: ['POST'],
  },
  {
    url: '/webhooks/woo-order',
    methods: ['POST'],
  },
  {
    url: '/webhooks/recurly',
    methods: ['POST'],
  },
  {
    url: '/webhooks/clickfunnels',
    methods: ['POST'],
  },
  {
    url: '/webhooks/user-reached-request-limit',
    methods: ['POST'],
  },
  {
    url: /\/paypal-orders.*/,
    methods: ['GET'],
  }, {
    url: /\/funnels\/is-private\/.+/,
    methods: ['GET'],
  }],
}));

app.use(bodyParser.text({
  type: ['text/xml', 'application/xml'],
}));

app.use(bodyParser.urlencoded({
  extended: true,
  type: 'application/x-www-form-urlencoded',
}));

app.use(bodyParser.raw({
  type: ['image/svg+xml'],
  limit: process.env.MAX_FILE_SIZE || '10mb',
}));

app.use(bodyParser.json({
  type: ['application/json', 'application/vnd.api+json'],
}));

app.use(require('cookie-parser')());

app.use('/assets', express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
  const referrer = req.get('referrer') || '';
  if ((process.env.DISABLE_API === 'true') && (referrer.indexOf('staging.funnelytics.io') === -1)) {
    return next(new AppError(
      503,
      process.env.DISABLE_API_REASON || 'Service Unavailable',
      process.env.DISABLE_API_MESSAGE || 'Please check back later',
    ));
  }
  return next();
});

app.use((req, res, next) => {
  if (process.env.LOG_REQUESTS === 'true') {
    const request = new RequestUtil(req);
    const ip = request.getIP();

    Firehose.putRecord({
      DeliveryStreamName: 'api-calls',
      Record: {
        Data: JSON.stringify({
          ip,
          user: _.get(req, 'user.id'),
          method: req.method,
          path: req.path,
          query: req.query,
          environment: process.env.NODE_ENV,
          visited_at: moment().format('YYYY-MM-DD HH:mm:ssZ'),
        }),
      },
    }, err => {
      if (err) {
        console.log('Error sending request data to Kinesis Firehose', err);
        // return;
      }
      // console.log('Successfully recorded request', data);
    });
  }

  return next();
});

recursive('./routes', (err, files) => {
  files.forEach(file => {
    let route = file.split(path.sep).splice(1).join(path.sep);
    route = route.slice(0, route.length - path.parse(route).ext.length);
    router.use(path.sep + route, require(`.${path.sep}${file}`)); // eslint-disable-line global-require
  });
});

app.use(router);

app.use((err, req, res, next) => {
  if (err) {
    if (err.name === 'UnauthorizedError') {
      const UNAUTHORIZED = 401;
      if (err.message !== 'No authorization token was found') {
        // Log more unusual errors just in case
        console.log(err);
      }

      return res.status(UNAUTHORIZED).json({
        errors: [
          {
            status: UNAUTHORIZED,
            title: 'Unauthorized',
            detail: 'Valid credentials are required to access this resource.',
          },
        ],
      });
    }
    if (err instanceof AppError) {
      return res.status(err.status).json({
        errors: [
          _.merge(err.toJSON(), {
            extra: err.extra,
          }),
        ],
      });
    }
    console.error(util.inspect(err, {
      depth: null,
      showHidden: false,
    }));
    return res.status(500).json({
      errors: [
        {
          title: 'Internal Server Error',
          detail: 'An unanticipated error occurred.',
          status: 500,
        },
      ],
    });
  }
  return next();
});

if (cluster.isMaster) {
  const cpus = os.cpus().length;
  for (let i = 0; i < cpus; i += 1) {
    cluster.fork();
  }
} else {
  const explicitPortArg = process.argv.find(_ => _.toLowerCase().includes('port=')) || '';
  const explicitPort = explicitPortArg.toLowerCase().replace('port=', '');
  const port = explicitPort || (process.env.PORT || 3000);

  const listener = app.listen(port, () => {
    const address = listener.address();
    console.info(`Started server on ${address.address}${address.port} in ${process.env.NODE_ENV || 'development'}`);
  });
}

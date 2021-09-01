const express = require('express');

const router = express.Router();
const Promise = require('bluebird');
const {
  errors,
  models: {
    dashboard: modelsDashboard,
  },
  databases: {
    dashboard: BookshelfDashboard,
  },
} = require('@funnelytics/shared-data');
const _ = require('lodash');
const stripe = require('stripe')(process.env.STRIPE_KEY);
const slack = require('slack-notify')(process.env.SLACK_WEBHOOK_URL);

// POST /, /create
router.post(['/', '/create'], (req, res, next) => {
  return BookshelfDashboard.transaction(transacting => {
    return modelsDashboard.User.forge().where({
      id: req.user.id,
    }).fetch({
      transacting,
      columns: ['email', 'stripe'],
    }).then(user => {
      if (user.get('stripe')) {
        if (req.body.source) {
          return stripe.customers.createSource(user.get('stripe'), {
            source: req.body.source,
          }).then(() => { return user; });
        }
        return user;
      }
      return stripe.customers.create({
        email: user.get('email'),
        source: req.body.source,
      }).then(customer => {
        return modelsDashboard.User.forge().where({
          id: req.user.id,
        }).save({
          stripe: customer.id,
        }, {
          transacting,
          patch: true,
        });
      }).then(() => {
        return modelsDashboard.User.forge().where({
          id: req.user.id,
        }).fetch({
          transacting,
          columns: ['stripe'],
        });
      });
    })
      .then(user => {
        return stripe.orders.create({
          currency: 'usd',
          customer: user.get('stripe'),
          items: _.map(req.body.cart, item => {
            return {
              type: 'sku',
              parent: item,
            };
          }),
        });
      });
  }).then(body => { return res.json(body); }).catch(err => {
    if (err.type == 'StripeCardError') {
      return next(new errors.AppError(
        400,
        'Payment Failed',
        err.message,
      ));
    }
    return next(err);
  });
});

// GET /:id, /find/:id
router.get(['/:id', '/find/:id'], (req, res, next) => {
  return Promise.props({
    order: stripe.orders.retrieve(req.params.id),
    user: modelsDashboard.User.forge().where({
      id: req.user.id,
    }).fetch({
      columns: ['stripe'],
    }),
  }).then(props => {
    if (props.user.get('stripe') != props.order.customer) {
      throw errors.predefined.generic.unauthorized;
    }
    return res.json(props.order);
  }).catch(err => { return next(err); });
});

// GET /, /find
router.get(['/', '/find'], (req, res, next) => {
  return modelsDashboard.User.forge().where({
    id: req.user.id,
  }).fetch({
    columns: ['stripe'],
  }).then(user => {
    return stripe.orders.list({
      customer: user.get('stripe'),
      ids: req.query.orders,
    });
  })
    .then(orders => { return res.json(orders); })
    .catch(err => { return next(err); });
});

// POST /pay/:id
router.post('/pay/:id', (req, res, next) => {
  return Promise.props({
    order: stripe.orders.retrieve(req.params.id),
    user: modelsDashboard.User.forge().where({
      id: req.user.id,
    }).fetch({
      columns: ['stripe'],
    }),
  }).then(props => {
    if (props.user.get('stripe') != props.order.customer) {
      throw errors.predefined.generic.unauthorized;
    }
    return stripe.orders.pay(req.params.id, {
      customer: props.user.get('stripe'),
    });
  }).then(order => { return res.json(order); }).catch(err => {
    if (err.type == 'StripeCardError' || err.type == 'StripeInvalidRequestError') {
      return next(new errors.AppError(
        400,
        'Payment Failed',
        err.message,
      ));
    }
    return next(err);
  });
});

router.post('/error', (req, res, next) => {
  return modelsDashboard.User.forge().where({
    id: req.user.id,
  }).fetch({
    columns: ['email'],
  }).then(user => {
    let headline;
    const email = user.get('email');
    switch (_.get(req, 'body.type')) {
      case 'info':
        headline = `ℹ️ User ${email} was asked by their bank to authenticate.`;
        break;
      case 'success':
        headline = `✅ User ${email} successfully authenticated with their bank`;
        break;
      case 'error':
        headline = `❗ User ${email} failed to authenticate with their bank`;
        break;
      default:
        headline = `❓ No type for this notification was supplied by the front-end! I wonder what ${email} is doing..`;
        break;
    }
    headline += `\nThey attempted to purchase on ${_.get(req, 'body.page')}`;

    slack.send({
      channel: process.env.NODE_ENV === 'production' ? '#product-notifications' : '#dev-notifications',
      text: headline,
    });
    return res.json({});
  }).catch(err => {
    return next(err);
  });
});

module.exports = router;

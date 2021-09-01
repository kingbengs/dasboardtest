const Promise = require('bluebird');
const express = require('express');
const Joi = require('@hapi/joi');

const router = express.Router();
const {
  serializer: JSONAPI,
  errors,
  models: {
    dashboard: modelsDashboard,
  },
  databases: {
    dashboard: BookshelfDashboard,
  },
  permissions: {
    PermissionManager,
    PermissionWrapper,
    PermissionScope,
    FetchPermissionOptions,
    AccessLevelInput,
  },
} = require('@funnelytics/shared-data');
const {
  constants: {
    Permissions,
  },
} = require('@funnelytics/utilities');

const AWS = require('aws-sdk');
// eslint-disable-next-line global-require
const S3 = new AWS.S3(require('aws-config')({
  accessKeyId: process.env.S3_ACCESS_KEY,
  secretAccessKey: process.env.S3_SECRET_KEY,
}));
const Revision = require('../lib/revisions');
const { REVISIONS_DEFAULT_LIMIT } = require('../lib/pagination/funnel-revisions');
const OffsetLimitPagination = require('../lib/pagination/OffsetLimitPagination');

const wrapAsync = require('../utils/asyncWrap');

const pagination = new OffsetLimitPagination(REVISIONS_DEFAULT_LIMIT);

const getFunnelRevisions = async (req, res) => {
  const funnelId = req.params.funnelId;

  return BookshelfDashboard.transaction(async transacting => {
    const permissionManager = new PermissionManager(req.user.id);
    const permissionOptions = new FetchPermissionOptions({
      transacting,
      permission: new PermissionWrapper(Permissions.TYPE_STARTER),
      scope: new PermissionScope({
        type: PermissionScope.TYPE_FUNNEL,
        instance: funnelId,
      }),
      accessLevel: new AccessLevelInput({ accessLevel: AccessLevelInput.WRITE }),
    });

    const permissionResponse = await permissionManager.fetchPermissionResponse(permissionOptions);

    if (!permissionResponse.getHasPermission()) {
      throw errors.predefined.generic.forbidden;
    }

    const model = modelsDashboard.Revision.forge().where({ funnel: funnelId });

    const result = await Promise.props({
      page: model
        .clone()
        .orderBy('created_at', 'DESC')
        .fetchPage({
          offset: pagination.getCurrentOffset(req),
          limit: pagination.getCurrentLimit(req),
          transacting,
        }),
      count: model
        .clone()
        .count({
          transacting,
        }),
    });

    const toReturn = await JSONAPI.serializeAsync('funnel-revision', result.page.toJSON());

    return res.json({
      ...toReturn,
      meta: {
        hasMore: pagination.hasMore(req, result.count)
      }
    });
  });
};

// POST /, /create
router.post(['/', '/create'], (req, res, next) => {
  req.body = JSONAPI.deserialize('funnel-revision', req.body);
  // TODO: Validation
  delete req.body.created_at;
  delete req.body.updated_at;
  return BookshelfDashboard.transaction(async transacting => {
    const permissionManager = new PermissionManager(req.user.id);
    const permissionOptions = new FetchPermissionOptions({
      transacting,
      permission: new PermissionWrapper(Permissions.TYPE_STARTER),
      scope: new PermissionScope({
        type: PermissionScope.TYPE_FUNNEL,
        instance: req.body.funnel,
      }),
      accessLevel: new AccessLevelInput({ accessLevel: AccessLevelInput.WRITE }),
    });

    const permissionResponse = await permissionManager.fetchPermissionResponse(permissionOptions);

    if (!permissionResponse.getHasPermission()) {
      throw errors.predefined.generic.forbidden;
    }

    return modelsDashboard.Revision.forge().save(req.body, {
      returning: '*',
      method: 'insert',
      transacting,
    });
  }).then(revision => {
    return JSONAPI.serializeAsync('funnel-revision', revision.toJSON());
  }).then(body => {
    return res.json(body);
  }).catch(err => {
    return next(err);
  });
});

// POST /upload
router.post('/upload', (req, res, next) => {
  return BookshelfDashboard.transaction(async transacting => {
    const body = await Promise.try(() => {
      return Joi.object().keys({
        funnel: Joi.string().required(),
        revision: Joi.string().required(),
        previewContentType: Joi.string().default('image/svg+xml').valid('image/png', 'image/svg+xml')
      }).validateAsync(req.body);
    }).catch(err => {
      throw errors.fromJoi(err);
    });

    const funnel = body.funnel.toLowerCase();
    const revision = body.revision.toLowerCase();
    const previewContentType = body.previewContentType;

    const permissionManager = new PermissionManager(req.user.id);
    const permissionOptions = new FetchPermissionOptions({
      transacting,
      permission: new PermissionWrapper(Permissions.TYPE_STARTER),
      scope: new PermissionScope({
        type: PermissionScope.TYPE_FUNNEL,
        instance: funnel,
      }),
      accessLevel: new AccessLevelInput({ accessLevel: AccessLevelInput.WRITE }),
    });

    const permissionResponse = await permissionManager.fetchPermissionResponse(permissionOptions);

    if (!permissionResponse.getHasPermission()) {
      throw errors.predefined.generic.forbidden;
    }

    return { funnel, revision, previewContentType };
  }).then(({ funnel, revision, previewContentType }) => {
    return Promise.props({
      funnel: new Promise((resolve, reject) => {
        S3.getSignedUrl('putObject', {
          Bucket: process.env.S3_FUNNELS_BUCKET,
          Key: `funnels/${funnel}/${revision}`,
          ACL: 'authenticated-read',
          ContentType: 'binary/octet-stream',
        }, (err, data) => {
          if (err) {
            reject(err);
          }
          resolve({
            url: data,
          });
        });
      }),
      preview: new Promise((resolve, reject) => {
        S3.getSignedUrl('putObject', {
          Bucket: process.env.S3_FUNNELS_BUCKET,
          Key: `previews/funnels/${funnel}`,
          ACL: 'authenticated-read',
          ContentType: previewContentType
        }, (err, data) => {
          if (err) {
            reject(err);
          }
          resolve({
            url: data,
          });
        });
      }),
    });
  }).then(urls => {
    return res.json(urls);
  }).catch(err => {
    return next(err);
  });
});

// GET /id
router.get('/id', (req, res, next) => {
  return BookshelfDashboard.transaction(transacting => {
    return Revision.getAvailableID({
      transacting,
    });
  }).then(id => {
    return res.json({
      id,
    });
  }).catch(err => {
    return next(err);
  });
});

router.get('/funnel/:funnelId', wrapAsync(getFunnelRevisions));

module.exports = router;

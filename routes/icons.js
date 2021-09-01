'use strict';

const express = require('express');

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
const Promise = require('bluebird');
const Joi = require('@hapi/joi');

const AWS = require('aws-sdk');
// eslint-disable-next-line global-require
const S3 = new AWS.S3(require('aws-config')({
  accessKeyId: process.env.S3_ACCESS_KEY,
  secretAccessKey: process.env.S3_SECRET_KEY,
  // region: process.env.AWS_S3_REGION
}));

// POST /, /create
router.post(['/', '/create'], (req, res, next) => {
  req.body = JSONAPI.deserialize('icon', req.body);
  return Promise.try(() => {
    return modelsDashboard.Icon.getSchema().validateAsync(req.body, {
      stripUnknown: true,
    });
  }).catch(err => {
    throw errors.fromJoi(err);
  }).then(validated => {
    return BookshelfDashboard.transaction(async transacting => {
      const permissionManager = new PermissionManager(req.user.id);
      const permissionOptions = new FetchPermissionOptions({
        transacting,
        permission: new PermissionWrapper(Permissions.TYPE_ICONS),
        scope: new PermissionScope({
          type: PermissionScope.TYPE_USER,
          instance: req.user.id,
        }),
        accessLevel: new AccessLevelInput({ accessLevel: AccessLevelInput.WRITE }),
      });

      const permissionResponse = await permissionManager.fetchPermissionResponse(permissionOptions);

      if (!permissionResponse.getHasPermission()) {
        throw errors.predefined.generic.forbidden;
      }

      return modelsDashboard.Icon.forge(validated).save({
        user: req.user.id,
      }, {
        transacting,
        patch: false,
        method: 'insert',
      });
    });
  }).then(icon => {
    return JSONAPI.serializeAsync('icon', icon.toJSON());
  }).then(body => {
    return res.status(201).json(body);
  }).catch(err => {
    return next(err);
  });
});

// GET /, /find
router.get(['/', '/find'], (req, res, next) => {
  return BookshelfDashboard.transaction(async transacting => {
    const permissionManager = new PermissionManager(req.user.id);
    const permissionOptions = new FetchPermissionOptions({
      transacting,
      permission: new PermissionWrapper(Permissions.TYPE_ICONS),
      scope: new PermissionScope({
        type: PermissionScope.TYPE_USER,
        instance: req.user.id,
      }),
      accessLevel: new AccessLevelInput({ accessLevel: AccessLevelInput.READ }),
    });

    const permissionResponse = await permissionManager.fetchPermissionResponse(permissionOptions);

    if (!permissionResponse.getHasPermission()) {
      throw errors.predefined.generic.forbidden;
    }

    return modelsDashboard.Icon.forge().where(req.query.filter || {}).query(qb => {
      qb.where('user', req.user.id);
    }).fetchAll({
      withRelated: req.query.include || [],
      transacting,
    });
  }).then(icons => {
    return JSONAPI.serializeAsync('icon', icons.toJSON());
  }).then(body => {
    return res.json(body);
  }).catch(err => {
    return next(err);
  });
});

// GET /:id, /find/:id
router.get(['/:id', '/find/:id'], (req, res, next) => {
  return BookshelfDashboard.transaction(async transacting => {
    const permissionManager = new PermissionManager(req.user.id);
    const permissionOptions = new FetchPermissionOptions({
      transacting,
      permission: new PermissionWrapper(Permissions.TYPE_ICONS),
      scope: new PermissionScope({
        type: PermissionScope.TYPE_USER,
        instance: req.user.id,
      }),
      accessLevel: new AccessLevelInput({ accessLevel: AccessLevelInput.READ }),
    });

    const permissionResponse = await permissionManager.fetchPermissionResponse(permissionOptions);

    if (!permissionResponse.getHasPermission()) {
      throw errors.predefined.generic.forbidden;
    }

    return modelsDashboard.Icon.forge().where(qb => {
      qb.where('user', req.user.id);
      qb.where('id', req.params.id);
    }).fetch({
      withRelated: req.query.include || [],
      transacting,
    });
  }).then(icon => {
    return JSONAPI.serializeAsync('icon', icon.toJSON());
  }).then(body => {
    return res.json(body);
  }).catch(err => {
    return next(err);
  });
});

// PATCH /:id, /edit/:id
router.patch(['/:id', '/edit/:id'], (req, res, next) => {
  req.body = JSONAPI.deserialize('icon', req.body);
  return Promise.try(() => {
    return modelsDashboard.Icon.getSchema().validateAsync(req.body, {
      stripUnknown: true,
    });
  }).catch(err => {
    throw errors.fromJoi(err);
  }).then(validated => {
    return BookshelfDashboard.transaction(async transacting => {
      const permissionManager = new PermissionManager(req.user.id);
      const permissionOptions = new FetchPermissionOptions({
        transacting,
        permission: new PermissionWrapper(Permissions.TYPE_ICONS),
        scope: new PermissionScope({
          type: PermissionScope.TYPE_USER,
          instance: req.user.id,
        }),
        accessLevel: new AccessLevelInput({ accessLevel: AccessLevelInput.ADMIN }),
      });

      const permissionResponse = await permissionManager.fetchPermissionResponse(permissionOptions);

      if (!permissionResponse.getHasPermission()) {
        throw errors.predefined.generic.forbidden;
      }

      return modelsDashboard.Icon.forge(validated).where(qb => {
        qb.where('user', req.user.id);
        qb.where('id', req.params.id);
      }).save(null, {
        method: 'update',
        returning: '*',
        transacting,
      });
    });
  }).then(icon => {
    return JSONAPI.serializeAsync('icon', icon.toJSON());
  }).then(body => {
    return res.json(body);
  }).catch(err => {
    return next(err);
  });
});

// POST /issue
router.post('/issue', (req, res, next) => {
  // TODO: Likely requires permissions... what is this?
  return Promise.try(() => {
    return Joi.object().keys({
      id: Joi.string().uuid({
        version: ['uuidv4'],
      }).required(),
    }).validateAsync(req.body, {
      stripUnknown: true,
    });
  }).catch(err => {
    throw errors.fromJoi(err);
  }).then(validated => {
    return new Promise((resolve, reject) => {
      S3.getSignedUrl('putObject', {
        Bucket: process.env.S3_FUNNELS_BUCKET,
        Key: `icons/users/${req.user.id}/${validated.id}`,
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
    });
  }).then(url => {
    return res.status(201).json(url);
  }).catch(err => {
    return next(err);
  });
});

// POST /issue/misc
router.post('/issue/misc', (req, res, next) => {
  // TODO: Likely requires permissions... what is this?
  return Promise.try(() => {
    return Joi.object().keys({
      id: Joi.string().uuid({
        version: ['uuidv4'],
      }).required(),
    }).validateAsync(req.body, {
      stripUnknown: true,
    });
  }).catch(err => {
    throw errors.fromJoi(err);
  }).then(validated => {
    return new Promise((resolve, reject) => {
      S3.getSignedUrl('putObject', {
        Bucket: process.env.S3_FUNNELS_BUCKET,
        Key: `icons/users/${req.user.id}/misc/${validated.id}`,
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
    });
  }).then(url => {
    return res.status(201).json(url);
  }).catch(err => {
    return next(err);
  });
});

router.delete(['/:id', 'delete/:id'], (req, res, next) => {
  return BookshelfDashboard.transaction(async transacting => {
    const permissionManager = new PermissionManager(req.user.id);
    const permissionOptions = new FetchPermissionOptions({
      transacting,
      permission: new PermissionWrapper(Permissions.TYPE_ICONS),
      scope: new PermissionScope({
        type: PermissionScope.TYPE_USER,
        instance: req.user.id,
      }),
      accessLevel: new AccessLevelInput({ accessLevel: AccessLevelInput.ADMIN }),
    });

    const permissionResponse = await permissionManager.fetchPermissionResponse(permissionOptions);

    if (!permissionResponse.getHasPermission()) {
      throw errors.predefined.generic.forbidden;
    }

    return modelsDashboard.Icon.forge().where(qb => {
      qb.where('user', req.user.id);
      qb.where('id', req.params.id);
    }).destroy({
      transacting,
    });
  }).then(icon => {
    return JSONAPI.serializeAsync('icon', icon.toJSON());
  }).then(body => {
    return res.json(body);
  }).catch(err => {
    return next(err);
  });
});

module.exports = router;

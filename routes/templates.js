const express = require('express');

const router = express.Router();
const _ = require('lodash');
const Promise = require('bluebird');
const AWS = require('aws-sdk');
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

// eslint-disable-next-line global-require
const S3 = new AWS.S3(require('aws-config')({
  accessKeyId: process.env.S3_ACCESS_KEY,
  secretAccessKey: process.env.S3_SECRET_KEY,
  // region: process.env.AWS_S3_REGION
}));

// POST /, /create
router.post(['/', '/create'], (req, res, next) => {
  req.body = JSONAPI.deserialize('template', req.body);
  if (!req.body.name) {
    req.body.name = 'Untitled Template';
  }
  return BookshelfDashboard.transaction(async t => {
    const permissionManager = new PermissionManager(req.user.id);
    const permissionOptions = new FetchPermissionOptions({
      transacting: t,
      permission: new PermissionWrapper(Permissions.TYPE_TEMPLATES),
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

    return Promise.try(() => {
      return modelsDashboard.Template.getSchema().validateAsync(req.body, {
        stripUnknown: true,
      });
      // TODO: Do we want to fromJoi this error?
    }).then(body => {
      return modelsDashboard.Template.forge(body).save({
        user: req.user.id,
      }, {
        transacting: t,
      });
    }).then(template => {
      return JSONAPI.serializeAsync('template', template.toJSON());
    }).then(body => {
      return res.status(201).json(body);
    }).catch(err => {
      return next(err);
    });
  });
});

// GET /, /find
router.get(['/', '/find'], (req, res, next) => {
  return modelsDashboard.Template.forge(req.query.filter || {}).where({
    user: req.user.id,
  }).fetchAll({
    withRelated: req.query.include || [],
  }).then(async templates => {
    const parsed = await Promise.map(templates.toJSON(), template => {
      return new Promise(resolve => {
        S3.getSignedUrl(
          'getObject',
          {
            Bucket: process.env.S3_FUNNELS_BUCKET,
            Key: `previews/templates/${_.get(template, 'id')}`,
          },
          (err, data) => {
            if (err) {
              return resolve(err);
            }
            return resolve(data);
          },
        );
      }).then(preview => {
        return _.merge(template, {
          preview_url: preview,
        });
      });
    });

    return JSONAPI.serializeAsync('template', parsed);
  }).then(body => {
    return res.json(body);
  }).catch(err => {
    return next(err);
  });
});

// GET /:id, /find/:id
router.get(['/:id', '/find/:id'], (req, res, next) => {
  // TODO: Will this still allow vault to be used?
  return BookshelfDashboard.transaction(async t => {
    const template = await modelsDashboard.Template.forge().where({
      id: req.params.id,
    }).fetch({
      withRelated: req.query.include || [],
      transacting: t,
    });

    if (!template) {
      throw errors.predefined.generic.nonexistent;
    }

    const permissionManager = new PermissionManager(req.user.id);
    const permissionOptions = new FetchPermissionOptions({
      transacting: t,
      permission: new PermissionWrapper(Permissions.TYPE_STARTER),
      scope: new PermissionScope({
        type: PermissionScope.TYPE_USER,
        instance: template.get('user'),
      }),
      accessLevel: new AccessLevelInput({ accessLevel: AccessLevelInput.READ }),
    });

    const permissionResponse = await permissionManager.fetchPermissionResponse(permissionOptions);

    if (!permissionResponse.getHasPermission()) {
      throw errors.predefined.generic.forbidden;
    }

    return template;
  }).then(template => {
    return JSONAPI.serializeAsync('template', template.toJSON());
  }).then(body => {
    return res.json(body);
  }).catch(err => {
    return next(err);
  });
});

// PATCH /:id, /edit/:id
router.patch(['/:id', '/edit/:id'], (req, res, next) => {
  _.each(req.body.data.relationships, (val, key) => {
    if (val.data == null) {
      delete req.body.data.relationships[key];
    } else if (Array.isArray(val.data)) {
      if (val.data.length === 0) {
        delete req.body.data.relationships[key];
      }
    }
  });
  req.body = JSONAPI.deserialize('template', req.body);
  return BookshelfDashboard.transaction(async t => {
    const template = await modelsDashboard.Template.forge().where({
      id: req.params.id,
    }).fetch({
      transacting: t,
    });

    if (!template) {
      throw errors.predefined.generic.nonexistent;
    }

    const permissionManager = new PermissionManager(req.user.id);
    const permissionOptions = new FetchPermissionOptions({
      transacting: t,
      permission: new PermissionWrapper(Permissions.TYPE_STARTER),
      scope: new PermissionScope({
        type: PermissionScope.TYPE_USER,
        instance: template.get('user'),
      }),
      accessLevel: new AccessLevelInput({ accessLevel: AccessLevelInput.WRITE }),
    });

    const permissionResponse = await permissionManager.fetchPermissionResponse(permissionOptions);

    if (!permissionResponse.getHasPermission()) {
      throw errors.predefined.generic.forbidden;
    }

    const saveableBody = _.pick(req.body, modelsDashboard.Template.getAttributes());

    return modelsDashboard.Template.forge().where({
      id: req.params.id,
      user: req.user.id,
    }).save(saveableBody, {
      transacting: t,
      patch: true,
      returning: [
        'id',
        ..._.keys(saveableBody),
      ],
    });
  }).then(template => {
    return JSONAPI.serializeAsync('template', template.toJSON());
  }).then(body => {
    return res.status(201).json(body);
  }).catch(err => {
    return next(err);
  });
});

// POST /save/:id
router.post('/save/:id', (req, res, next) => {
  return BookshelfDashboard.transaction(async t => {
    const template = await modelsDashboard.Template.forge().where({
      id: req.params.id,
    }).fetch({
      transacting: t,
    });

    if (!template) {
      throw errors.predefined.generic.nonexistent;
    }

    const permissionManager = new PermissionManager(req.user.id);
    const permissionOptions = new FetchPermissionOptions({
      transacting: t,
      permission: new PermissionWrapper(Permissions.TYPE_TEMPLATES),
      scope: new PermissionScope({
        type: PermissionScope.TYPE_USER,
        instance: template.get('user'),
      }),
      accessLevel: new AccessLevelInput({ accessLevel: AccessLevelInput.WRITE }),
    });

    const permissionResponse = await permissionManager.fetchPermissionResponse(permissionOptions);

    if (!permissionResponse.getHasPermission()) {
      throw errors.predefined.generic.forbidden;
    }

    return Promise.props({
      template: new Promise((resolve, reject) => {
        S3.getSignedUrl('putObject', {
          Bucket: process.env.S3_FUNNELS_BUCKET,
          Key: `templates/${req.params.id}`,
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
          Key: `previews/templates/${req.params.id}`,
          ACL: 'authenticated-read',
          ContentType: 'image/svg+xml',
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

// GET /load/:id
router.get('/load/:id', (req, res, next) => {
  return BookshelfDashboard.transaction(async t => {
    const template = await modelsDashboard.Template.forge().where({
      id: req.params.id,
    }).fetch({
      transacting: t,
    });

    if (!template) {
      throw errors.predefined.generic.nonexistent;
    }

    const permissionManager = new PermissionManager(req.user.id);
    const permissionOptions = new FetchPermissionOptions({
      transacting: t,
      permission: new PermissionWrapper(Permissions.TYPE_STARTER),
      scope: new PermissionScope({
        type: PermissionScope.TYPE_USER,
        instance: template.get('user'),
      }),
      accessLevel: new AccessLevelInput({ accessLevel: AccessLevelInput.READ }),
    });

    const permissionResponse = await permissionManager.fetchPermissionResponse(permissionOptions);

    if (!permissionResponse.getHasPermission()) {
      throw errors.predefined.generic.forbidden;
    }

    return new Promise((resolve, reject) => {
      S3.getSignedUrl('getObject', {
        Bucket: process.env.S3_FUNNELS_BUCKET,
        Key: `templates/${req.params.id}`,
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
    return res.json(url);
  }).catch(err => {
    return next(err);
  });
});

router.get('/vault/:id', (req, res) => {
  return BookshelfDashboard.transaction(t => {
    return Promise.props({
      funnel: modelsDashboard.Funnel.forge()
        .where('id', req.params.id)
        .fetch({
          transacting: t,
          columns: ['id', 'name'],
        }),
      revision: modelsDashboard.Revision.forge({
        funnel: req.params.id,
      })
        .orderBy('created_at', 'DESC')
        .fetch({
          transacting: t,
        }),
    })
      .then(result => {
        return new Promise((resolve, reject) => {
          if (!result.revision) {
            resolve(null);
            return;
          }
          S3.getSignedUrl(
            'getObject',
            {
              Bucket: process.env.S3_FUNNELS_BUCKET,
              Key: `funnels/${result.funnel.get('id')}/${result.revision.get('id')}`,
            },
            (err, data) => {
              if (err) {
                return reject(err);
              }
              return resolve({
                url: data,
              });
            },
          );
        });
      })
      .then(url => {
        if (url) {
          return res.json(url);
        }
        return res.status(404).json({});
      });
  });
});


// DELETE /:id, /delete/:id
router.delete(['/:id', '/delete/:id'], (req, res, next) => {
  return BookshelfDashboard.transaction(async t => {
    const template = await modelsDashboard.Template.forge().where({
      id: req.params.id,
    }).fetch({
      transacting: t,
    });

    if (!template) {
      throw errors.predefined.generic.nonexistent;
    }

    const permissionManager = new PermissionManager(req.user.id);
    const permissionOptions = new FetchPermissionOptions({
      transacting: t,
      permission: new PermissionWrapper(Permissions.TYPE_STARTER),
      scope: new PermissionScope({
        type: PermissionScope.TYPE_USER,
        instance: template.get('user'),
      }),
      accessLevel: new AccessLevelInput({ accessLevel: AccessLevelInput.ADMIN }),
    });

    const permissionResponse = await permissionManager.fetchPermissionResponse(permissionOptions);

    if (!permissionResponse.getHasPermission()) {
      throw errors.predefined.generic.forbidden;
    }
    return modelsDashboard.Template.forge().where({
      id: req.params.id,
      user: req.user.id,
    }).destroy({
      transacting: t,
    });
  }).then(template => {
    return JSONAPI.serializeAsync('template', template.toJSON());
  }).then(body => {
    return res.status(202).json(body);
  }).catch(err => {
    return next(err);
  });
});

module.exports = router;

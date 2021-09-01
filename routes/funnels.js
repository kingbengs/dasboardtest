const express = require('express');

const _ = require('lodash');
const Promise = require('bluebird');
const Joi = require('@hapi/joi');
const url = require('url');
const AWS = require('aws-sdk');
const request = require('request-promise');
const uuid = require('uuid/v4');
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
    FetchPermissionAllowanceOptions,
    AccessLevelInput,
  },
} = require('@funnelytics/shared-data');
const {
  constants: {
    Upgrades,
    Permissions,
  },
} = require('@funnelytics/utilities');
const ScreenshotsCloud = require('screenshotscloud');
const AWSConfig = require('aws-config');
const RequestUser = require('../lib/users/RequestUser');
const FunnelConstants = requireRoot('/constants/funnel');

const router = express.Router();
const screenshots = ScreenshotsCloud(
  process.env.SCREENSHOTS_CLOUD_KEY,
  process.env.SCREENSHOTS_CLOUD_SECRET,
);
// eslint-disable-next-line global-require
const S3 = new AWS.S3(
  AWSConfig({
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
    region: process.env.AWS_S3_REGION,
  }),
);
const config = require('../config');
const wrapAsync = require('../utils/asyncWrap');

// POST /, /create
router.post(['/', '/create'], (req, res, next) => {
  req.body = JSONAPI.deserialize('funnel', req.body);
  return BookshelfDashboard.transaction(async t => {
    const user = new RequestUser(req.user.id);
    const [
      limitResponse,
      current,
    ] = await Promise.all([
      user.getFunnelLimit({
        transacting: t,
      }),
      user.getFunnelCount({
        transacting: t,
      }),
    ]);
    if (limitResponse.isAtOrExceedsLimit(current)) {
      return Promise.reject(new errors.AppError(
        402,
        'Reached Funnel Limit',
        'You\'ve reached your funnel limit. To create additional funnels you need to upgrade your account.',
        {
          [Upgrades.SUGGESTED_ATTR]: Upgrades.ANY_SUBSCRIPTION,
        },
      ));
    }
    return Promise.try(() => {
      return modelsDashboard.Funnel.getSchema().validateAsync(req.body, {
        stripUnknown: true,
      });
    }).catch(err => {
      throw errors.fromJoi(err);
    }).then(async validated => {
      if (!validated.project) {
        // No project, just need to check if the user trying to create the funnel exists...
        return modelsDashboard.User.forge({
          id: req.user.id,
        }).fetch({
          transacting: t,
        }).then(userRecord => {
          if (!userRecord) {
            throw errors.predefined.generic.nonexistent;
          }

          return validated;
        });
      }

      const funnels = await new RequestUser(req.user.id).getFunnelCount({
        transacting: t,
      });

      // TODO: What happens with this for unorganized funnels...?
      const permissionManager = new PermissionManager(req.user.id);
      const permissionOptions = new FetchPermissionOptions({
        transacting: t,
        permission: new PermissionWrapper(Permissions.TYPE_STARTER),
        scope: new PermissionScope({
          type: PermissionScope.TYPE_PROJECT,
          instance: validated.project,
        }),
        accessLevel: new AccessLevelInput({ accessLevel: AccessLevelInput.WRITE }),
      });

      const permissionAllowanceOptions = new FetchPermissionAllowanceOptions({
        transacting: t,
        // TODO: This scope should really be the scope of the owner of the project (if in a project)
        scope: new PermissionScope({
          type: PermissionScope.TYPE_USER,
          instance: req.user.id,
        }),
        permission: new PermissionWrapper(Permissions.TYPE_FUNNELS_ALLOWANCE),
        accessLevel: new AccessLevelInput({
          accessLevel: AccessLevelInput.WRITE,
        }),
        // TODO: This funnel count should be the count of funnels for owner of the project (if in a project)
        count: funnels + 1,
      });

      const results = await Promise.props({
        hasWritePermission: permissionManager.fetchPermissionResponse(permissionOptions),
        hasSufficientAllowance: permissionManager.fetchPermissionResponse(permissionAllowanceOptions),
      });

      if (!results.hasSufficientAllowance.getHasPermission()) {
        throw new errors.AppError(402, 'Hit Quota', 'You\'ve reached the maximum number of funnels you may have.');
      }

      if (!results.hasWritePermission.getHasPermission()) {
        throw errors.predefined.generic.forbidden;
      }

      return validated;
    }).then(validated => {
      return modelsDashboard.Funnel.forge(validated).save({
        user: req.user.id,
        is_private: true,
      }, {
        transacting: t,
      });
    });
  }).then(funnel => {
    return JSONAPI.serializeAsync('funnel', funnel.toJSON());
  }).then(body => {
    return res.status(201).json(body);
  }).catch(err => {
    return next(err);
  });
});

// POST /unlock
router.post('/unlock', (req, res, next) => {
  return BookshelfDashboard.transaction(async transacting => {
    const body = await Promise.try(() => {
      return Joi.object().keys({
        id: Joi.string().uuid({
          version: ['uuidv4'],
        }),
      }).validateAsync(req.body);
    });
    const user = new RequestUser(req.user.id);
    const { isFunnelOwner, funnelCount, limitResponse } = await Promise.props({
      isFunnelOwner: modelsDashboard.Funnel.forge().where(qb => {
        qb.where('funnels.id', body.id);
        qb.whereIn('funnels.id', inner => {
          inner.select('funnels.id').from('funnels');
          inner.where('funnels.user', req.user.id);
          inner.unionAll(union => {
            union.select('funnels.id').from('funnels');
            union.whereIn('funnels.project', inner2 => {
              inner2.select('projects.id').from('projects');
              inner2.where('projects.user', req.user.id);
            });
          });
        });
      }).count({
        transacting,
      }).then(count => {
        return count > 0;
      }),
      funnelCount: user.getFunnelCount({
        transacting,
      }),
      limitResponse: user.getFunnelLimit({
        transacting,
      }),
    });

    if (!isFunnelOwner) {
      return Promise.reject(errors.predefined.generic.nonexistent);
    }

    if (limitResponse.isAtOrExceedsLimit(funnelCount)) {
      return Promise.reject(new errors.AppError(
        402,
        'Upgrade Required',
        'You must upgrade before you can unlock another funnel.',
        {
          [Upgrades.SUGGESTED_ATTR]: Upgrades.PRO_SUBSCRIPTION,
        },
      ));
    }

    return modelsDashboard.Funnel.forge().save({
      id: body.id,
      is_locked: false,
    }, {
      method: 'UPDATE',
      patch: true,
      returning: '*',
      transacting,
    });
  }).then(funnel => {
    return JSONAPI.serializeAsync('funnel', funnel.toJSON());
  }).then(body => {
    return res.json(body);
  }).catch(err => {
    return next(err);
  });
});

// POST /thumbnail
router.post('/thumbnail', (req, res, next) => {
  if (!req.body.url) {
    return next(new errors.AppError(
      400,
      'URL Required',
      'No URL was found in the query body.',
    ));
  }
  if (['http:', 'https:'].indexOf(url.parse(req.body.url).protocol) === -1) {
    return next(new errors.AppError(
      400,
      'Invalid URL',
      'You must provide a valid URL.',
    ));
  }
  const key = `${req.user.id}/${uuid()}`;
  return request({
    method: 'GET',
    encoding: null,
    url: screenshots.screenshotUrl({
      url: req.body.url,
      width: 300,
      viewport_width: 1300,
      viewport_height: 1600,
      cache_time: 86400,
      format: 'jpg',
      quality: 50,
    }),
  }).then(buffer => {
    return new Promise((resolve, reject) => {
      S3.putObject({
        Bucket: 'funnelytics-thumbnails',
        Key: key,
        Body: buffer,
        ContentEncoding: 'base64',
        ContentType: 'image/jpg',
      }, (err, data) => {
        if (err) {
          return reject(err);
        }
        return resolve(data);
      });
    });
  }).then(() => {
    return res.json({
      path: key,
    });
  }).catch(err => {
    return next(err);
  });
});

// GET /count
router.get('/count', (req, res, next) => {
  return Promise.try(() => {
    return BookshelfDashboard.transaction(async transacting => {
      const userId = req.user.id;
      const requestUser = new RequestUser(userId);

      return requestUser.getFunnelCount({
        transacting,
      });
    }).then(funnelCount => {
      return res.json({
        funnels: {
          count: funnelCount,
        },
      });
    });
  }).catch(next);
});

const getLastCreatedFunnel = async (req, res) => {
  const funnel = (await modelsDashboard.Funnel.forge()
    .where({ user: req.user.id, is_locked: false })
    .orderBy('created_at', 'DESC')
    .fetchPage({
      limit: 1,
    }))
    .first();

  if (!funnel) {
    throw errors.predefined.generic.nonexistent;
  }

  return res.json(await JSONAPI.serializeAsync('funnel', funnel.toJSON()));
};

// GET /last-created-funnel
router.get('/last-created', wrapAsync(getLastCreatedFunnel));

// GET /has-unorganized-funnel
router.get('/has-unorganized-funnel', (req, res, next) => {
  return modelsDashboard.Funnel.forge().query(qb => {
    qb.where('user', req.user.id);
    qb.whereNull('project');
  }).count().then(count => {
    return res.json({
      count: parseInt(count, 10),
    });
  });
});

// GET /is-private/:id
router.get('/is-private/:id', async (req, res, next) => {
  return BookshelfDashboard.transaction(async t => {
    let isPrivate = true;
    const funnel = await modelsDashboard.Funnel.forge().where('id', req.params.id).fetch({
      transacting: t,
      columns: ['id', 'project', 'is_private', 'name'],
    });

    const revision = await modelsDashboard.Revision.forge({
      funnel: req.params.id,
    })
      .orderBy('created_at', 'DESC')
      .fetch({
        transacting: t,
      });

    let authorization = req.header('authorization');
    if (funnel.get('is_private') === false) {
      isPrivate = false;
    } else if (authorization) {
      authorization = authorization.split(' ')[1];

      const user = await RequestUser.getDecodedToken(authorization);
      const permissionManager = new PermissionManager(user.id);
      const permissionOptions = new FetchPermissionOptions({
        transacting: t,
        permission: new PermissionWrapper(Permissions.TYPE_STARTER),
        scope: new PermissionScope({
          type: PermissionScope.TYPE_PROJECT,
          instance: funnel.get('project'),
        }),
        accessLevel: new AccessLevelInput({
          accessLevel: AccessLevelInput.READ,
        }),
      });
      const permissions = await permissionManager.fetchPermissionResponse(permissionOptions);

      isPrivate = !permissions.getHasPermission();
    }
    return Promise.props({
      isPrivate,
      funnel,
      revision,
    });
  }).then(async result => {
    const response = {
      is_private: result.isPrivate,
    };
    if (!result.isPrivate) {
      response.funnel = await Promise.props({
        name: result.funnel.get('name'),
        url: new Promise((resolve, reject) => {
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
              return resolve(data);
            },
          );
        }),
        preview: new Promise(resolve => {
          S3.getSignedUrl(
            'getObject',
            {
              Bucket: process.env.S3_FUNNELS_BUCKET,
              Key: `previews/funnels/${_.get(req, 'params.id')}`,
            },
            (err, data) => {
              if (err) {
                return resolve(err);
              }
              return resolve(data);
            },
          );
        }),
      });
    }
    return res.status(200).json(response);
  }).catch(err => {
    return next(err);
  });
});

// GET /, /find
router.get(['/', '/find'], (req, res, next) => {
  const mustLockFunnels = false;
  return BookshelfDashboard.transaction(t => {
    const requestUser = new RequestUser(req.user.id);
    return Promise.all([
      modelsDashboard.User.forge({
        id: req.user.id,
      }).count({
        transacting: t,
        columns: ['id'],
      }),
      requestUser.getFunnelCount({
        transacting: t,
      }),
      requestUser.getFunnelLimit({
        transacting: t,
      }),
    ]).then(result => {
      const [
        user,
        count,
        limitResponse,
      ] = result;

      if (!user) {
        throw errors.predefined.generic.nonexistent;
      }

      const funnel = modelsDashboard.Funnel.forge().query(qb => {
        qb.whereIn('funnels.id', whereInQuery => {
          whereInQuery.select('funnels.id').from('funnels');
          whereInQuery.where('funnels.user', req.user.id);
          whereInQuery.unionAll(unionQuery => {
            unionQuery.select('funnels.id').from('funnels');
            unionQuery.whereIn('funnels.project', whereInClient => {
              whereInClient.select('project_clients.project').from('project_clients');
              whereInClient.where('project_clients.user', req.user.id);
            });
            unionQuery.orWhereIn('funnels.project', whereInProjects => {
              whereInProjects.select('projects.id').from('projects');
              whereInProjects.where('projects.user', req.user.id);
            });
          });
        });
        for (const key in req.query.filter) {
          if (req.query.filter[key]) {
            qb.where(`funnels.${key}`, req.query.filter[key]);
          } else {
            qb.whereNull(`funnels.${key}`);
          }
        }
      });
      const related = req.query.include || [];
      if (related.indexOf('project') === -1) {
        related.push('project');
      }
      return Promise.props({
        funnels: funnel.clone().fetchAll({
          transacting: t,
          withRelated: related,
        }),
        count: funnel.clone().count({
          transacting: t,
        }),
        ownedCount: count,
        limitResponse,
      });
    });
  }).then(async result => {
    // const { limitResponse, ownedCount } = result;
    // const funnelCount = Math.max(0, ownedCount - 1);
    // mustLockFunnels = limitResponse.isAtOrExceedsLimit(funnelCount);

    const funnels = await Promise.map(_.map(result.funnels.toJSON()), funnel => {
      return new Promise(resolve => {
        S3.getSignedUrl(
          'getObject',
          {
            Bucket: process.env.S3_FUNNELS_BUCKET,
            Key: `previews/funnels/${_.get(funnel, 'id')}`,
          },
          (err, data) => {
            if (err) {
              return resolve(err);
            }
            return resolve(data);
          },
        );
      }).then(signed => {
        funnel.preview_url = signed;
        if (mustLockFunnels) {
          if (_.get(funnel, 'user', '').toLowerCase() !== req.user.id.toLowerCase()) {
            return funnel;
          }
          if (funnel.project && _.get(funnel, 'project.user', '').toLowerCase() !== req.user.id.toLowerCase()) {
            return funnel;
          }
          return _.merge(funnel, {
            is_locked: true,
          });
        }
        return funnel;
      });
    });

    return JSONAPI.serializeAsync('funnel', funnels, {
      count: parseInt(result.count, 10),
    });
  }).then(body => {
    return res.json(body);
  }).then(() => {
    if (mustLockFunnels) {
      modelsDashboard.Funnel.forge().where(qb => {
        /**
         * This will include funnels that are part of already deleted projects, which is fine.
         */
        qb.whereIn('id', BookshelfDashboard.knex.raw(
          `
            (
              SELECT funnels.id
              FROM funnels
              WHERE funnels.user = ?
              AND funnels.project IS NULL
              AND funnels.is_locked = false
            )
            UNION ALL
            (
              SELECT funnels.id
              FROM funnels
              JOIN projects ON funnels.project = projects.id
              WHERE funnels.project IS NOT NULL
              AND funnels.is_locked = false
              AND projects.user = ?
            )
          `,
          [
            req.user.id,
            req.user.id,
          ],
        ));
      }).save({
        is_locked: true,
      }, {
        patch: true,
        method: 'UPDATE',
        required: false,
      })
    }
  }).catch(err => {
    return next(err);
  });
});

// GET /:id, /find/:id
router.get(['/:id', '/find/:id'], (req, res, next) => {
  return BookshelfDashboard.transaction(async t => {
    const permissionManager = new PermissionManager(req.user.id);
    const requestUser = new RequestUser(req.user.id);
    const permissionOptions = new FetchPermissionOptions({
      transacting: t,
      permission: new PermissionWrapper(Permissions.TYPE_STARTER),
      scope: new PermissionScope({
        type: PermissionScope.TYPE_FUNNEL,
        instance: req.params.id,
      }),
      accessLevel: new AccessLevelInput({ accessLevel: AccessLevelInput.READ }),
    });

    const permissionResponse = await permissionManager.fetchPermissionResponse(permissionOptions);

    if (!permissionResponse.getHasPermission()) {
      throw errors.predefined.generic.forbidden;
    }

    const funnel = await modelsDashboard.Funnel.forge().where({
      id: req.params.id,
    }).fetch({
      transacting: t,
      withRelated: req.query.include || [],
    });

    if (!funnel) {
      throw errors.predefined.generic.nonexistent;
    }

    const hasAccessToNewVersion = await requestUser.hasAccessToNewVersion(t);

    if(!hasAccessToNewVersion && funnel.attributes.version === FunnelConstants.NewVersion) {
      throw errors.predefined.generic.forbidden;
    }

    return funnel;
  }).then(funnel => {
    return JSONAPI.serializeAsync('funnel', funnel.toJSON());
  }).then(body => {
    return res.json(body);
  }).catch(err => {
    return next(err);
  });
});

// DELETE /:id, /delete/:id
router.delete(['/:id', '/delete/:id'], (req, res, next) => {
  return BookshelfDashboard.transaction(async t => {
    const permissionManager = new PermissionManager(req.user.id);
    const permissionOptions = new FetchPermissionOptions({
      transacting: t,
      permission: new PermissionWrapper(Permissions.TYPE_STARTER),
      scope: new PermissionScope({
        type: PermissionScope.TYPE_FUNNEL,
        instance: req.params.id,
      }),
      accessLevel: new AccessLevelInput({ accessLevel: AccessLevelInput.ADMIN }),
    });

    const permissionResponse = await permissionManager.fetchPermissionResponse(permissionOptions);

    if (!permissionResponse.getHasPermission()) {
      throw errors.predefined.generic.forbidden;
    }

    return modelsDashboard.Funnel.forge().where({
      id: req.params.id,
    }).destroy({
      transacting: t,
    });
  }).then(funnel => {
    return JSONAPI.serializeAsync('funnel', funnel.toJSON());
  }).then(body => {
    return res.status(202).json(body);
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
  req.body = JSONAPI.deserialize('funnel', req.body);
  return Promise.try(() => {
    return modelsDashboard.Funnel.getSchema().validateAsync(req.body, {
      stripUnknown: true,
    });
  }).catch(err => {
    throw errors.fromJoi(err);
  }).then(validated => {
    return BookshelfDashboard.transaction(async t => {
      const funnel = await modelsDashboard.Funnel.forge().where({
        id: req.params.id,
      }).fetch({
        transacting: t,
        columns: ['project'],
      });

      if (!funnel) {
        throw errors.predefined.generic.forbidden;
      }

      let permissionRequired = validated.project && validated.project !== funnel.get('project')
        ? AccessLevelInput.ADMIN
        : AccessLevelInput.WRITE;
      if (Boolean(funnel.get('is_private')) !== validated.is_private) {
        permissionRequired = AccessLevelInput.ADMIN;
      }

      const permissionManager = new PermissionManager(req.user.id);
      const permissionOptions = new FetchPermissionOptions({
        transacting: t,
        permission: new PermissionWrapper(Permissions.TYPE_STARTER),
        scope: new PermissionScope({
          type: PermissionScope.TYPE_FUNNEL,
          instance: req.params.id,
        }),
        accessLevel: new AccessLevelInput({ accessLevel: permissionRequired }),
      });

      const permissionResponse = await permissionManager.fetchPermissionResponse(permissionOptions);

      if (!permissionResponse.getHasPermission()) {
        throw errors.predefined.generic.forbidden;
      }

      if (validated.project) {
        const projectPermissionOptions = new FetchPermissionOptions({
          transacting: t,
          permission: new PermissionWrapper(Permissions.TYPE_STARTER),
          scope: new PermissionScope({
            type: PermissionScope.TYPE_PROJECT,
            instance: validated.project,
          }),
          accessLevel: new AccessLevelInput({ accessLevel: AccessLevelInput.WRITE }),
        });

        const projectPermissionResponse = await permissionManager.fetchPermissionResponse(projectPermissionOptions);

        if (!projectPermissionResponse.getHasPermission()) {
          throw errors.predefined.generic.forbidden;
        }
      }

      return modelsDashboard.Funnel.forge().where(qb => {
        qb.where('id', req.params.id);
      }).save(validated, {
        transacting: t,
        patch: true,
        returning: '*',
      });
    });
  }).then(funnel => {
    return JSONAPI.serializeAsync('funnel', funnel.toJSON());
  }).then(body => {
    return res.status(201).json(body);
  }).catch(err => {
    return next(err);
  });
});

// GET /load/:id
router.get('/load/:id', (req, res, next) => {
  return BookshelfDashboard.transaction(async t => {
    const permissionManager = new PermissionManager(req.user.id);
    const permissionOptions = new FetchPermissionOptions({
      transacting: t,
      permission: new PermissionWrapper(Permissions.TYPE_STARTER),
      scope: new PermissionScope({
        type: PermissionScope.TYPE_FUNNEL,
        instance: req.params.id,
      }),
      accessLevel: new AccessLevelInput({ accessLevel: AccessLevelInput.READ }),
    });

    const permissionResponse = await permissionManager.fetchPermissionResponse(permissionOptions);

    if (!permissionResponse.getHasPermission()) {
      throw errors.predefined.generic.forbidden;
    }

    const revisionsFilter = {
      funnel: req.params.id,
    };

    if (req.query.revision) {
      revisionsFilter.id = req.query.revision;
    }

    const requestUser = new RequestUser(req.user.id);

    return Promise.props({
      project: modelsDashboard.Project.forge().where(qb => {
        qb.where('id', sub => {
          sub.select('funnels.project').from('funnels');
          sub.where('funnels.id', req.params.id);
        });
      }).fetch({
        columns: ['id', 'is_locked'],
        transacting: t,
      }),
      funnel: modelsDashboard.Funnel.forge().where({
        id: req.params.id,
      }).fetch({
        transacting: t,
      }),
      revision: modelsDashboard.Revision
        .forge(revisionsFilter)
        .orderBy('created_at', 'DESC').fetch({
          transacting: t,
        }),
      hasAccessToNewVersion: requestUser.hasAccessToNewVersion(t),
    }).then(result => {
      let projectIsLocked = false;
      if (result.project) {
        projectIsLocked = result.project.get('is_locked') === true;
      }

      if(!result.hasAccessToNewVersion && result.funnel.attributes.version === FunnelConstants.NewVersion) {
        throw errors.predefined.generic.forbidden;
      }

      if (result.funnel.get('is_locked') === true || projectIsLocked) {
        // TODO: May need to improve this flow with Upgrades.SUGGESTED_ATTR
        return Promise.reject(new errors.AppError(
          402,
          'Funnel Locked',
          'Either your workspace or funnel is locked. Upgrade to unlock this funnel.',
        ));
      }
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
    });
  }).then(url => {
    if (url) {
      return res.json(url);
    }
    return res.status(404).json({});
  }).catch(err => {
    return next(err);
  });
});

// GET /share/:id
router.get('/share/:id', (req, res, next) => {
  return BookshelfDashboard.transaction(t => {
    const permissionManager = new PermissionManager(req.user.id);
    const permissionOptions = new FetchPermissionOptions({
      transacting: t,
      permission: new PermissionWrapper(Permissions.TYPE_STARTER),
      scope: new PermissionScope({
        type: PermissionScope.TYPE_FUNNEL,
        instance: req.params.id,
      }),
      accessLevel: new AccessLevelInput({ accessLevel: AccessLevelInput.READ }),
    });
    return Promise.props({
      funnel: modelsDashboard.Funnel.forge().where('id', req.params.id).fetch({
        transacting: t,
        columns: ['id', 'name', 'is_private'],
      }),
      revision: modelsDashboard.Revision.forge({
        funnel: req.params.id,
      }).orderBy('created_at', 'DESC').fetch({
        transacting: t,
      }),
      permissions: permissionManager.fetchPermissionResponse(permissionOptions),
    }).then(result => {
      if (!result.funnel) {
        throw errors.predefined.generic.forbidden;
      }
      if ((result.funnel.get('is_private') === true) && (result.permissions.getHasPermission() === false)) {
        throw errors.predefined.generic.forbidden;
      }
      const ids = {
        funnel: uuid(),
        revision: uuid(),
      };
      return Promise.props({
        funnel: modelsDashboard.Funnel.forge().save(
          {
            id: ids.funnel,
            name: result.funnel.get('name'),
            user: req.user.id,
            is_private: true,
          },
          {
            transacting: t,
          },
        ),
        revision: modelsDashboard.Revision.forge().save(
          {
            id: ids.revision,
            funnel: ids.funnel,
          },
          {
            transacting: t,
          },
        ),
        copy: Promise.all([
          new Promise((resolve, reject) => {
            S3.copyObject(
              {
                CopySource: `/${config.bucket}/funnels/${result.funnel.get('id')}/${result.revision.get('id')}`,
                Bucket: config.bucket,
                Key: `funnels/${ids.funnel}/${ids.revision}`,
              },
              (err, data) => {
                if (err) {
                  return reject(err);
                }
                return resolve(data);
              },
            );
          }),
          new Promise((resolve, reject) => {
            S3.copyObject(
              {
                CopySource: `/${config.bucket}/previews/funnels/${result.funnel.get('id')}`,
                Bucket: config.bucket,
                Key: `previews/funnels/${ids.funnel}`,
              },
              (err, data) => {
                if (err) {
                  return reject(err);
                }
                return resolve(data);
              },
            );
          }),
        ]),
      });
    });
  }).then(result => {
    return JSONAPI.serializeAsync('funnel', result.funnel.toJSON());
  }).then(serialized => {
    return res.status(201).json(serialized);
  }).catch(err => {
    return next(err);
  });
});

// POST /png/retrieve
router.post('/png/retrieve', (req, res, next) => {
  return request({
    url: _.get(req, 'body.url'),
    method: 'GET',
    encoding: null,
  }).then(data => {
    res.setHeader('Content-Type', 'image/png');
    return res.send(data);
  }).catch(err => {
    return next(err);
  });
});

// GET /png/status/:conversion
router.get('/png/status/:conversion', async (req, res, next) => {
  const conversion = await request({
    url: `https://api.convertio.co/convert/${req.params.conversion}/status`,
    json: true,
  });

  if (_.get(conversion, 'data.step') === 'finish') {
    try {
      const image = await request({
        method: 'GET',
        url: _.get(conversion, 'data.output.url'),
        encoding: null,
      });
      const path = `exports/png/${_.get(req, 'user.id')}/${_.get(conversion, 'data.id')}`;

      await new Promise((resolve, reject) => {
        S3.putObject({
          Bucket: process.env.S3_FUNNELS_BUCKET,
          Key: path,
          Body: image,
          ContentEncoding: 'base64',
          ContentType: 'image/png',
        }, (err, data) => {
          if (err) {
            return reject(err);
          }
          return resolve(data);
        });
      });

      const url = await new Promise(resolve => {
        S3.getSignedUrl(
          'getObject',
          {
            Bucket: process.env.S3_FUNNELS_BUCKET,
            Key: path,
          },
          (err, data) => {
            if (err) {
              return resolve(err);
            }
            return resolve(data);
          },
        );
      });

      return res.json(_.merge(conversion, {
        data: {
          output: {
            url,
          },
        },
      }));
    } catch (err) {
      return next(err);
    }
  }

  return res.json(conversion);
});

// DELETE /png/cancel/:conversion
router.delete('/png/cancel/:conversion', (req, res, next) => {
  return request({
    url: `https://api.convertio.co/convert/${req.params.conversion}`,
    method: 'DELETE',
  }).then(data => {
    return res.send(data);
  }).catch(err => {
    return next(err);
  });
});

// POST /png/:id
router.post('/png/:id', (req, res, next) => {
  const max = 4000;
  const dimensions = {
    width: parseFloat(req.query.width),
    height: parseFloat(req.query.height),
  };

  if (dimensions.width > dimensions.height) {
    dimensions.width = max;
    dimensions.height = max / parseFloat(req.query.width) * parseFloat(req.query.height);
  } else {
    dimensions.width = max / parseFloat(req.query.height) * parseFloat(req.query.width);
    dimensions.height = max;
  }

  return request({
    url: 'http://manual-browser-api-balancer-2048677378.us-west-2.elb.amazonaws.com/exports/png',
    method: 'POST',
    encoding: null,
    qs: dimensions,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
    },
    body: req.body.toString('utf8'),
  }).then(content => {
    res.set('Content-Type', 'image/png');
    res.send(content);
  }).catch(err => {
    return next(err);
  });
});

module.exports = router;

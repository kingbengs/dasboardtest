'use strict';

const express = require('express');

const router = express.Router();
const Promise = require('bluebird');
const Joi = require('@hapi/joi');
const _ = require('lodash');
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
const RequestUser = require('../lib/users/RequestUser');
const WorkspaceLimitHandler = require('../lib/account/WorkspaceLimitHandler');
const UserWorkspaces = require('../lib/workspaces/UserWorkspaces');
const { getLogoUrl } = require('../lib/projects/custom-attributes');
const redisDatabase = require('../lib/databases/dialects/RedisDatabase');

// POST /, /create
router.post(['/', '/create'], (req, res, next) => {
  req.body = JSONAPI.deserialize('project', req.body);
  const userId = req.user.id;
  const requestUser = new RequestUser(userId);
  const workspaceLimitHandler = new WorkspaceLimitHandler({
    requestUser,
  });

  return BookshelfDashboard.transaction(async transacting => {
    await workspaceLimitHandler.assert({
      transacting,
    });

    return Promise.try(() => {
      return modelsDashboard.Project.getSchema().validateAsync(req.body, {
        stripUnknown: true,
      });
    }).catch(err => {
      throw errors.fromJoi(err);
    }).then(async validated => {
      const permissionManager = new PermissionManager(req.user.id);
      const permissionOptions = new FetchPermissionOptions({
        transacting,
        permission: new PermissionWrapper(Permissions.TYPE_STARTER),
        scope: new PermissionScope({
          type: PermissionScope.TYPE_USER,
          instance: req.user.id,
        }),
        accessLevel: new AccessLevelInput({
          accessLevel: AccessLevelInput.WRITE,
        }),
      });

      const results = await Promise.props({
        hasWritePermission: permissionManager.fetchPermissionResponse(permissionOptions),
      });

      if (!results.hasWritePermission.getHasPermission()) {
        throw errors.predefined.generic.forbidden;
      }

      return validated;
    }).then(async validated => {
      // const user = new User(req.user.id);

      return modelsDashboard.Project.forge(validated).save({
        user: req.user.id,
        tracking: true,
        // Keeping this commented out for now, as existing pro users don't posses this meta property
        /*
        await user.getMeta('allowed_project_tracking', {
          transacting,
        }) === true,
        */
      }, {
        transacting,
      });
    });
  }).then(project => {
    return JSONAPI.serializeAsync('project', project.toJSON());
  }).then(body => {
    return res.status(201).json(body);
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

      return requestUser.getWorkspaceCount({
        transacting,
      });
    }).then(workspaceCount => {
      return res.json({
        workspaces: {
          count: workspaceCount,
        },
      });
    });
  }).catch(next);
});

// GET /, /find
router.get(['/', '/find'], (req, res, next) => {
  return Promise.try(() => {
    return BookshelfDashboard.transaction(async transacting => {
      const userId = req.user.id;
      const requestUser = new RequestUser(userId);
      const userWorkspaces = new UserWorkspaces(userId);
      const {
        limitResponse,
        current,
        list,
      } = await Promise.props({
        limitResponse: requestUser.getWorkspaceLimit({
          transacting,
        }),
        current: requestUser.getWorkspaceCount({
          transacting,
        }),
        list: userWorkspaces.fetch({
          filter: req.query.filter,
          withRelated: req.query.include,
          transacting,
        }),
      });
      const oneLessThanTotalProjectCount = Math.max(0, current - 1);
      const isExceedingProjectLimit = limitResponse.isAtOrExceedsLimit(oneLessThanTotalProjectCount);

      const listJSON = await Promise.map(list.toJSON(), async (project) => {
        let mappedProject = project;

        if (isExceedingProjectLimit && project.user.id.toLowerCase() === userId.toLowerCase()) {
          mappedProject = _.merge(mappedProject, { is_locked: true });
        }

        const logoUrl = await getLogoUrl(project.id, transacting);

        return _.merge(mappedProject, { logo_url: logoUrl });
      });

      return JSONAPI.serializeAsync('project', listJSON)
        .then(body => {
          return res.json(body);
        })
        .then(() => {
          if (!isExceedingProjectLimit) {
            return null;
          }

          return WorkspaceLimitHandler.lockAllWorkspaces({
            userId,
            transacting,
          });
        });
    });
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
      permission: new PermissionWrapper(Permissions.TYPE_STARTER),
      scope: new PermissionScope({
        type: PermissionScope.TYPE_PROJECT,
        instance: req.params.id,
      }),
      accessLevel: new AccessLevelInput({ accessLevel: AccessLevelInput.WRITE }),
    });

    const permissionResponse = await permissionManager.fetchPermissionResponse(permissionOptions);

    if (!permissionResponse.getHasPermission()) {
      throw errors.predefined.generic.forbidden;
    }

    const project = await modelsDashboard.Project.forge().where(_.merge(req.query.filter || {}, {
      id: req.params.id,
    })).fetch({
      withRelated: req.query.include || [],
      transacting,
    });

    // TODO: Not 100% sure about this one:
    if (project.get('is_locked') === true) {
      throw Promise.reject(new errors.AppError(
        402,
        'Workspace Locked',
        'This workspace is locked. Upgrade to unlock this workspace.',
      ));
    }

    const logoUrl = await getLogoUrl(project.get('id'), transacting);

    return _.merge(project.toJSON(), {
      logo_url: logoUrl,
    });
  }).then(projectJSON => {
    return JSONAPI.serializeAsync('project', projectJSON);
  }).then(body => {
    return res.json(body);
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
      }).validateAsync(req.body, {
        stripUnknown: true,
      });
    }).catch(err => {
      throw errors.fromJoi(err);
    });

    const userId = req.user.id;

    const requestUser = new RequestUser(userId);
    const workspaceLimitHandler = new WorkspaceLimitHandler({
      requestUser,
    });
    await Promise.all([
      workspaceLimitHandler.assert({
        transacting,
      }),
      modelsDashboard.Project.forge().where({
        id: body.id,
        user: req.user.id,
      }).count({
        transacting,
      }).then(count => {
        const exists = count >= 1;
        if (!exists) {
          return Promise.reject(errors.predefined.generic.nonexistent);
        }
        return true;
      }),
    ]);

    return modelsDashboard.Project.forge().where({
      id: body.id,
    }).save({
      is_locked: false,
    }, {
      method: 'UPDATE',
      patch: true,
      returning: '*',
      transacting,
    });
  }).then(project => {
    return JSONAPI.serializeAsync('project', project.toJSON());
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
  req.body = JSONAPI.deserialize('project', req.body);

  return BookshelfDashboard.transaction(t => {
    return Promise.try(() => {
      return modelsDashboard.Project.getSchema().validateAsync(req.body, {
        stripUnknown: true,
      });
    }).catch(err => {
      throw errors.fromJoi(err);
    }).then(async validated => {
      const permissionManager = new PermissionManager(req.user.id);
      const permissionOptions = new FetchPermissionOptions({
        transacting: t,
        permission: new PermissionWrapper(Permissions.TYPE_STARTER),
        scope: new PermissionScope({
          type: PermissionScope.TYPE_PROJECT,
          instance: req.params.id,
        }),
        accessLevel: new AccessLevelInput({ accessLevel: AccessLevelInput.WRITE }),
      });

      const permissionResponse = await permissionManager.fetchPermissionResponse(permissionOptions);

      if (!permissionResponse.getHasPermission()) {
        throw errors.predefined.generic.forbidden;
      }

      return validated;
    }).then(validated => {
      return modelsDashboard.Project.forge().where(qb => {
        qb.where('id', req.params.id);
      }).save(validated, {
        transacting: t,
        patch: true,
      });
    });
  }).then(project => {
    return JSONAPI.serializeAsync('project', project.toJSON());
  }).then(body => {
    return res.json(body);
  }).catch(err => {
    return next(err);
  });
});

// DELETE /:id, /delete/:id
router.delete(['/:id', '/delete/:id'], (req, res, next) => {
  let projectOwnerId = null;
  return BookshelfDashboard.transaction(async transacting => {
    const userId = req.user.id;
    const permissionManager = new PermissionManager(userId);
    const permissionOptions = new FetchPermissionOptions({
      transacting,
      permission: new PermissionWrapper(Permissions.TYPE_STARTER),
      scope: new PermissionScope({
        type: PermissionScope.TYPE_PROJECT,
        instance: req.params.id,
      }),
      accessLevel: new AccessLevelInput({ accessLevel: AccessLevelInput.ADMIN }),
    });

    const canDeleteThisProjectPermission = await permissionManager.fetchPermissionResponse(permissionOptions);

    if (!canDeleteThisProjectPermission.getHasPermission()) {
      throw errors.predefined.generic.forbidden;
    }

    // Turn off tracking for the mirrored Tracking Database
    const projectToDelete = await modelsDashboard.Project.forge().where({
      id: req.params.id,
    }).save({
      tracking: false,
    }, {
      transacting,
      patch: true,
      returning: ['id', 'user'],
    });

    projectOwnerId = projectToDelete.get('user');

    return modelsDashboard.Project.forge({
      id: projectToDelete.get('id'),
    }).destroy({
      transacting,
    });
  }).then(() => {
    return JSONAPI.serializeAsync('project', {});
  }).then(body => {
    return res.status(202).json(body);
  }).catch(err => {
    return next(err);
  });
});

router.get('/user/:id', (req, res, next) => {
  return BookshelfDashboard.transaction(async transacting => {
    const adminUserId = req.user.id;
    const requestedUserId = req.params.id;
    const requestingUser = await modelsDashboard.User.forge().where('id', adminUserId).fetch({
      columns: ['role'],
      transacting,
    });
    const isNotAdmin = requestingUser.get('role') <= 3;
    if (isNotAdmin) {
      throw errors.predefined.generic.unauthorized;
    }

    const userWorkspaces = new UserWorkspaces(requestedUserId);
    return userWorkspaces.fetch({
      transacting,
    });
  }).then(workspaceBookshelfRecords => {
    return JSONAPI.serializeAsync('project', workspaceBookshelfRecords.toJSON());
  }).then(body => {
    return res.json(body);
  }).catch(err => {
    return next(err);
  });
});

router.get('/:id/api-key', (req, res, next) => {
  return BookshelfDashboard.transaction(async transacting => {
    const permissionManager = new PermissionManager(req.user.id);
    const permissionOptions = new FetchPermissionOptions({
      transacting,
      permission: new PermissionWrapper(Permissions.TYPE_STARTER),
      scope: new PermissionScope({
        type: PermissionScope.TYPE_PROJECT,
        instance: req.params.id,
      }),
      accessLevel: new AccessLevelInput({
        accessLevel: AccessLevelInput.ADMIN,
      }),
    });

    const hasAdminPermission = await permissionManager.fetchPermissionResponse(permissionOptions);
    if (!hasAdminPermission) {
      throw errors.predefined.generic.forbidden;
    }

    const cache = await redisDatabase.getClient();
    const workspaceId = req.params.id;
    let projectSettings;
    try {
      projectSettings = await new Promise((resolve, reject) => {
        cache.get(`projects:${workspaceId}:settings`, (err, data) => {
          if (err) {
            return reject(err);
          }

          return resolve(JSON.parse(data));
        });
      });
    } catch (err) {
      throw new Error(`Could not retrieve projects:${workspaceId}:settings from redis.`);
    }
    if (!projectSettings) {
      throw new Error(`Could not find projects:${workspaceId}:settings in redis.`);
    }
    const storedTrackingApiKey = _.get(projectSettings, ['tracking_api_key'], '');
    if (!storedTrackingApiKey || !_.isString(storedTrackingApiKey)) {
      throw new Error(`Could not find tracking_api_key attribute on projects:${workspaceId}:settings in redis.`);
    }
    if (storedTrackingApiKey.length !== 64) {
      throw new Error(`tracking_api_key attribute on projects:${workspaceId}:settings does not appear to be a SHA-256 hash.`);
    }

    return `Basic ${Buffer.from(`${workspaceId}:${storedTrackingApiKey}`).toString('base64')}`;
  }).then(result => {
    return res.json({
      api_key: result,
    });
  }).catch(next);
});

module.exports = router;

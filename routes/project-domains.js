'use strict';

const express = require('express');
const _ = require('lodash');
const Bluebird = require('bluebird');

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

// POST /, /create
router.post(['/', '/create'], (req, res, next) => {
  req.body = JSONAPI.deserialize('project-domain', req.body);
  return BookshelfDashboard.transaction(transacting => {
    return Bluebird.try(() => {
      return modelsDashboard.ProjectDomain.getSchema().validateAsync(req.body, {
        stripUnknown: true,
      });
    }).catch(err => {
      throw errors.fromJoi(err);
    }).then(async validated => {
      const permissionManager = new PermissionManager(req.user.id);
      const permissionOptions = new FetchPermissionOptions({
        transacting,
        permission: new PermissionWrapper(Permissions.TYPE_ANALYTICS),
        scope: new PermissionScope({
          type: PermissionScope.TYPE_PROJECT,
          instance: validated.project,
        }),
        accessLevel: new AccessLevelInput({ accessLevel: AccessLevelInput.ADMIN }),
      });

      const permissionResponse = await permissionManager.fetchPermissionResponse(permissionOptions);

      if (!permissionResponse.getHasPermission()) {
        throw errors.predefined.generic.forbidden;
      }

      return modelsDashboard.ProjectDomain.forge(validated).save(null, {
        transacting,
      });
    });
  }).then(projectDomain => {
    return JSONAPI.serializeAsync('project-domain', projectDomain.toJSON());
  }).then(body => {
    return res.status(201).json(body);
  }).catch(err => {
    return next(err);
  });
});

// PATCH /edit/:id, /:id
router.patch(['/edit/:id', '/:id'], (req, res, next) => {
  req.body = JSONAPI.deserialize('project-domain', req.body);
  return Bluebird.try(() => {
    return modelsDashboard.ProjectDomain.getSchema().validateAsync(req.body, {
      stripUnknown: true,
    });
  }).catch(err => {
    throw errors.fromJoi(err);
  }).then(validated => {
    return BookshelfDashboard.transaction(async transacting => {
      const projectDomain = await modelsDashboard.ProjectDomain.forge().where({
        id: req.params.id,
      }).fetch({
        columns: ['project'],
        transacting,
      });

      if (!projectDomain) {
        throw errors.predefined.generic.forbidden;
      }

      const permissionManager = new PermissionManager(req.user.id);
      const permissionOptions = new FetchPermissionOptions({
        transacting,
        permission: new PermissionWrapper(Permissions.TYPE_ANALYTICS),
        scope: new PermissionScope({
          type: PermissionScope.TYPE_PROJECT,
          instance: projectDomain.get('project'),
        }),
        accessLevel: new AccessLevelInput({ accessLevel: AccessLevelInput.ADMIN }),
      });

      const permissionResponse = await permissionManager.fetchPermissionResponse(permissionOptions);

      if (!permissionResponse.getHasPermission()) {
        throw errors.predefined.generic.forbidden;
      }

      return modelsDashboard.ProjectDomain.forge().where({
        id: req.params.id,
      }).save(validated, {
        transacting,
        patch: true,
        method: 'update',
        returning: '*',
      });
    });
  }).then(projectDomain => {
    return JSONAPI.serializeAsync('project-domain', projectDomain.toJSON());
  }).then(body => {
    return res.status(201).json(body);
  }).catch(err => {
    return next(err);
  });
});

// GET /, /find
router.get(['/', '/find'], (req, res, next) => {
  return modelsDashboard.ProjectDomain.forge().query(qb => {
    qb.whereIn('project_domains.project', whereinQuery => {
      whereinQuery.select('projects.id').from('projects');
      whereinQuery.where('projects.user', req.user.id);
      whereinQuery.whereNull('projects.deleted_at');
      whereinQuery.unionAll(unionAllQuery => {
        unionAllQuery.select('project_clients.project').from('project_clients');
        unionAllQuery.where('project_clients.user', req.user.id);
        unionAllQuery.where('project_clients.permissions', '>=', 0);
      });
    });
    _.each(req.query.filter, (value, key) => {
      qb.where(key, value);
    });
  }).fetchAll({
    withRelated: req.query.include || [],
  }).then(projectDomains => {
    return JSONAPI.serializeAsync('project-domain', projectDomains.toJSON());
  }).then(body => {
    return res.json(body);
  }).catch(err => {
    return next(err);
  });
});

// GET /:id, /find/:id
router.get(['/:id', '/find/:id'], (req, res, next) => {
  return BookshelfDashboard.transaction(async transacting => {
    const projectDomain = await modelsDashboard.ProjectDomain.forge().where({
      id: req.params.id,
    }).fetch({
      columns: ['project'],
      transacting,
    });

    if (!projectDomain) {
      throw errors.predefined.generic.forbidden;
    }

    const permissionManager = new PermissionManager(req.user.id);
    const permissionOptions = new FetchPermissionOptions({
      transacting,
      permission: new PermissionWrapper(Permissions.TYPE_ANALYTICS),
      scope: new PermissionScope({
        type: PermissionScope.TYPE_PROJECT,
        instance: projectDomain.get('project'),
      }),
      accessLevel: new AccessLevelInput({ accessLevel: AccessLevelInput.READ }),
    });

    const permissionResponse = await permissionManager.fetchPermissionResponse(permissionOptions);

    if (!permissionResponse.getHasPermission()) {
      throw errors.predefined.generic.forbidden;
    }

    return modelsDashboard.ProjectDomain.forge().where({
      id: req.params.id,
    }).fetch({
      transacting,
    });
  }).then(projectDomain => {
    return JSONAPI.serializeAsync('project-domain', projectDomain.toJSON());
  }).then(body => {
    return res.json(body);
  }).catch(err => {
    return next(err);
  });
});

// DELETE /:id, /delete/:id
router.delete(['/:id', '/delete/:id'], (req, res, next) => {
  return BookshelfDashboard.transaction(async transacting => {
    const projectDomain = await modelsDashboard.ProjectDomain.forge().where({
      id: req.params.id,
    }).fetch({
      columns: ['project'],
      transacting,
    });

    if (!projectDomain) {
      throw errors.predefined.generic.forbidden;
    }

    const permissionManager = new PermissionManager(req.user.id);
    const permissionOptions = new FetchPermissionOptions({
      transacting,
      permission: new PermissionWrapper(Permissions.TYPE_ANALYTICS),
      scope: new PermissionScope({
        type: PermissionScope.TYPE_PROJECT,
        instance: projectDomain.get('project'),
      }),
      accessLevel: new AccessLevelInput({ accessLevel: AccessLevelInput.ADMIN }),
    });

    const permissionResponse = await permissionManager.fetchPermissionResponse(permissionOptions);

    if (!permissionResponse.getHasPermission()) {
      throw errors.predefined.generic.forbidden;
    }

    return modelsDashboard.ProjectDomain.forge().where({
      id: req.params.id,
    }).destroy({
      transacting,
    });
  }).then(projectDomain => {
    return JSONAPI.serializeAsync('project-domain', projectDomain.toJSON());
  }).then(body => {
    return res.status(202).json(body);
  }).catch(err => {
    return next(err);
  });
});

module.exports = router;

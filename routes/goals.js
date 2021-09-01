'use strict';

const express = require('express');
const Bluebird = require('bluebird');

const router = express.Router();
const {
  models: {
    dashboard: modelsDashboard,
  },
  databases: {
    dashboard: BookshelfDashboard,
  },
  serializer: JSONAPI,
  errors,
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
const Joi = require('@hapi/joi');
const _ = require('lodash');

// POST /, /create
router.post(['/', '/create'], (req, res, next) => {
  req.body = JSONAPI.deserialize('goal', req.body);
  return Bluebird.try(() => {
    return modelsDashboard.Goal.getSchema().validateAsync(req.body, {
      stripUnknown: true,
    });
  }).catch(err => {
    throw errors.fromJoi(err);
  }).then(body => {
    return BookshelfDashboard.transaction(async transacting => {
      const permissionManager = new PermissionManager(req.user.id);
      const permissionOptions = new FetchPermissionOptions({
        transacting,
        permission: new PermissionWrapper(Permissions.TYPE_STARTER),
        scope: new PermissionScope({
          type: PermissionScope.TYPE_FUNNEL,
          instance: body.funnel,
        }),
        accessLevel: new AccessLevelInput({
          accessLevel: AccessLevelInput.WRITE,
        }),
      });
      const hasPermission = (await permissionManager.fetchPermissionResponse(permissionOptions)).getHasPermission();

      if (!hasPermission) {
        throw errors.predefined.generic.forbidden;
      }

      return modelsDashboard.Goal.forge(body).save(null, {
        transacting,
      });
    });
  }).then(goal => {
    return JSONAPI.serializeAsync('goal', goal.toJSON());
  }).then(body => {
    return res.status(201).json(body);
  }).catch(err => {
    return next(err);
  });
});

// GET /:id, /find/:id
router.get(['/:id', '/find/:id'], (req, res, next) => {
  return BookshelfDashboard.transaction(async transacting => {
    const funnel = _.get(
      await transacting.select('goals.funnel').from('goals').where('goals.id', req.params.id),
      '0.funnel',
    );

    if (!funnel) {
      throw errors.predefined.generic.forbidden;
    }

    const permissionManager = new PermissionManager(req.user.id);
    const permissionOptions = new FetchPermissionOptions({
      transacting,
      permission: new PermissionWrapper(Permissions.TYPE_STARTER),
      scope: new PermissionScope({
        type: PermissionScope.TYPE_FUNNEL,
        instance: funnel,
      }),
      accessLevel: new AccessLevelInput({
        accessLevel: AccessLevelInput.READ,
      }),
    });
    const hasPermission = (await permissionManager.fetchPermissionResponse(permissionOptions)).getHasPermission();

    if (!hasPermission) {
      throw errors.predefined.generic.forbidden;
    }

    return modelsDashboard.Goal.forge().query(qb => {
      qb.where('id', req.params.id);
    }).fetch({
      transacting,
    });
  }).then(goals => {
    return JSONAPI.serializeAsync('goal', goals.toJSON());
  }).then(body => {
    return res.status(201).json(body);
  }).catch(err => {
    return next(err);
  });
});

// GET /, /find
router.get(['/', '/find'], (req, res, next) => {
  return modelsDashboard.Goal.forge().query(qb => {
    qb.whereIn('goals.funnel', qb2 => {
      qb2.select('funnels.id').from('funnels');
      qb2.where('funnels.user', req.user.id);
      qb2.orWhereIn('funnels.project', whereInQuery => {
        whereInQuery.select('projects.id').from('projects');
        whereInQuery.where('projects.user', req.user.id);
        // No need to keep getting goals from since-deleted funnels
        whereInQuery.whereNull('projects.deleted_at');
        whereInQuery.unionAll(unionQuery => {
          unionQuery.select('project_clients.project').from('project_clients');
          unionQuery.where('project_clients.user', req.user.id);
        });
      });
    });
    _.each(_.get(req, 'query.filter', {}), (value, key) => {
      qb.andWhere(`goals.${key}`, value);
    });
  }).fetchAll().then(goals => {
    return JSONAPI.serializeAsync('goal', goals.toJSON());
  }).then(body => {
    return res.json(body);
  }).catch(err => {
    return next(err);
  });
});

// PATCH /:id, /edit/:id
router.patch(['/:id', '/edit/:id'], (req, res, next) => {
  req.body = JSONAPI.deserialize('goal', req.body);
  return Bluebird.try(() => {
    return modelsDashboard.Goal.getSchema().keys({
      funnel: Joi.string().uuid({
        version: ['uuidv4'],
      }).optional().empty(null).allow(''),
    }).validateAsync(req.body, {
      stripUnknown: true,
    });
  }).catch(err => {
    throw errors.fromJoi(err);
  }).then(validated => {
    return BookshelfDashboard.transaction(async transacting => {
      const funnel = _.get(
        await transacting.select('goals.funnel').from('goals').where('goals.id', req.params.id),
        '0.funnel',
      );

      if (!funnel) {
        throw errors.predefined.generic.forbidden;
      }

      const permissionManager = new PermissionManager(req.user.id);
      const permissionOptions = new FetchPermissionOptions({
        transacting,
        permission: new PermissionWrapper(Permissions.TYPE_STARTER),
        scope: new PermissionScope({
          type: PermissionScope.TYPE_FUNNEL,
          instance: funnel,
        }),
        accessLevel: new AccessLevelInput({
          accessLevel: AccessLevelInput.WRITE,
        }),
      });
      const hasPermission = (await permissionManager.fetchPermissionResponse(permissionOptions)).getHasPermission();

      if (!hasPermission) {
        throw errors.predefined.generic.forbidden;
      }

      return modelsDashboard.Goal.forge({
        id: req.params.id,
      }).query(qb => {
        qb.where('goals.id', req.params.id);
      }).save(validated, {
        transacting,
        patch: true,
      });
    });
  }).then(goal => {
    if (!goal) {
      throw errors.predefined.generic.forbidden;
    }
    return JSONAPI.serializeAsync('goal', goal.toJSON());
  }).then(body => {
    return res.json(body);
  }).catch(err => {
    return next(err);
  });
});

// DELETE /:id, /delete/:id
router.delete(['/:id', '/delete/:id'], (req, res, next) => {
  return BookshelfDashboard.transaction(async transacting => {
    const funnel = _.get(
      await transacting.select('goals.funnel').from('goals').where('goals.id', req.params.id),
      '0.funnel',
    );

    if (!funnel) {
      throw errors.predefined.generic.forbidden;
    }

    const permissionManager = new PermissionManager(req.user.id);
    const permissionOptions = new FetchPermissionOptions({
      transacting,
      permission: new PermissionWrapper(Permissions.TYPE_STARTER),
      scope: new PermissionScope({
        type: PermissionScope.TYPE_FUNNEL,
        instance: funnel,
      }),
      accessLevel: new AccessLevelInput({
        accessLevel: AccessLevelInput.WRITE,
      }),
    });
    const hasPermission = (await permissionManager.fetchPermissionResponse(permissionOptions)).getHasPermission();

    if (!hasPermission) {
      throw errors.predefined.generic.forbidden;
    }

    return modelsDashboard.Goal.forge().where({
      id: req.params.id,
    }).query(qb => {
      qb.where('goals.id', req.params.id);
    }).destroy({
      transacting,
    });
  }).then(goal => {
    return JSONAPI.serializeAsync('goal', goal.toJSON());
  }).then(body => {
    return res.json(body);
  }).catch(err => {
    return next(err);
  });
});

module.exports = router;

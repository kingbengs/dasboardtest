'use strict';

const express = require('express');
const Joi = require('@hapi/joi');
const Bluebird = require('bluebird');
const _ = require('lodash');
const { v4: uuid } = require('uuid');
const {
  databases: {
    dashboard: BookshelfDashboard,
  },
  errors,
  models: {
    dashboard: modelsDashboard,
  },
  permissions: {
    AccessLevelInput,
    PermissionManager,
    PermissionWrapper,
    PermissionScope,
    FetchPermissionOptions,
    FetchPermissionAllowanceOptions,
  },
} = require('@funnelytics/shared-data');
const {
  constants: {
    Permissions: { ALL_PERMISSIONS },
  },
} = require('@funnelytics/utilities');

const asyncWrap = require('../utils/asyncWrap');
const { ADMIN_ROLE } = require('../constants/user');

const router = express.Router();

// GET /has-permission
router.get('/has-permission', (req, res, next) => {
  return Bluebird.try(() => {
    return Joi.object().keys({
      permission: Joi.string().required(),
      scope: Joi.string().optional().empty(null),
      scopeId: Joi.string().optional().empty(null),
      count: Joi.number().integer().optional().empty(null),
      level: Joi.string().default('read').valid('read', 'write', 'admin'),
    }).validateAsync(req.query, {
      stripUnknown: true,
    });
  }).catch(err => {
    throw errors.fromJoi(err);
  }).then(validated => {
    let accessLevel;
    switch (validated.level) {
      case 'read': {
        accessLevel = AccessLevelInput.READ;
        break;
      }
      case 'write': {
        accessLevel = AccessLevelInput.WRITE;
        break;
      }
      case 'admin': {
        accessLevel = AccessLevelInput.ADMIN;
        break;
      }
      default: {
        throw new Error(`Invalid level "${validated.level}"`);
      }
    }

    return BookshelfDashboard.transaction(async transacting => {
      const manager = new PermissionManager(req.user.id);
      const OptionsConstructor = validated.count ? FetchPermissionAllowanceOptions : FetchPermissionOptions;
      const permissionOptions = new OptionsConstructor({
        transacting,
        permission: new PermissionWrapper(validated.permission),
        scope: new PermissionScope({
          type: validated.scope,
          instance: validated.scopeId,
        }),
        accessLevel: new AccessLevelInput({
          accessLevel,
        }),
        count: validated.count,
      });

      const permissionResponse = await manager.fetchPermissionResponse(permissionOptions);

      return permissionResponse.getHasPermission();
    });
  }).then(permitted => {
    return res.json({
      permitted,
    });
  }).catch(err => {
    return next(err);
  });
});

const permissionsValidationMiddleware = async (req, res, next) => {
  const { userId } = await Joi.object().keys({
    permission: Joi.string().valid(...Object.values(ALL_PERMISSIONS)).required(),
    userId: Joi.string().required(),
  }).validateAsync(req.body, {
    stripUnknown: true,
  }).catch(error => {
    throw errors.fromJoi(error);
  });

  const [isAdmin, isUserExist] = await Promise.all([
    modelsDashboard.User.forge().where(
      {
        id: req.user.id,
        role: ADMIN_ROLE,
      },
    ).fetch(),
    modelsDashboard.User.forge().where(
      {
        id: userId,
      },
    ).fetch(),
  ]);

  if (!isUserExist) {
    throw errors.predefined.users.nonexistent;
  }

  if (!isAdmin) {
    throw errors.predefined.generic.forbidden;
  }

  req.permissionModel = await modelsDashboard.Permission.forge().where({ name: req.body.permission }).fetch();
  next();
};

router.post(
  '/set-permission',
  asyncWrap(permissionsValidationMiddleware),
  asyncWrap(async (req, res) => {
    const { permission, userId } = req.body;

    const now = new Date();
    await BookshelfDashboard.knex.raw(
      'insert into user_permissions values(?, ?, ?, ?, ?, ?, ?)',
      [uuid(), userId, req.permissionModel.get('id'), null, now, now, true],
    );

    res.json({ message: `successfully granted permission: ${permission}` });
  }),
);

router.delete(
  '/halt-permission',
  asyncWrap(permissionsValidationMiddleware),
  asyncWrap(async (req, res) => {
    const { permission, userId } = req.body;

    await BookshelfDashboard.knex.raw(
      'delete from user_permissions where "user" = ? and "permission" = ?',
      [
        userId,
        req.permissionModel.get('id'),
      ],
    );

    res.json({ message: `successfully removed permission: ${permission}` });
  }),
);

// GET /has-permission
router.get('/allowance-count', (req, res, next) => {
  return Bluebird.try(() => {
    return Joi.object().keys({
      permission: Joi.string().required(),
      scope: Joi.string().optional().empty(null),
      scopeId: Joi.string().optional().empty(null),
      level: Joi.string().default('write').valid('write', 'admin'),
    }).validateAsync(req.query, {
      stripUnknown: true,
    });
  }).catch(err => {
    throw errors.fromJoi(err);
  }).then(validated => {
    let accessLevel;
    switch (validated.level) {
      case 'write': {
        accessLevel = AccessLevelInput.WRITE;
        break;
      }
      case 'admin': {
        accessLevel = AccessLevelInput.ADMIN;
        break;
      }
      default: {
        throw new Error(`Invalid level "${validated.level}"`);
      }
    }

    return BookshelfDashboard.transaction(async transacting => {
      const manager = new PermissionManager(req.user.id);
      const permissionOptions = new FetchPermissionAllowanceOptions({
        transacting,
        permission: new PermissionWrapper(validated.permission),
        scope: new PermissionScope({
          type: validated.scope,
          instance: validated.scopeId,
        }),
        accessLevel: new AccessLevelInput({
          accessLevel,
        }),
      });

      return manager.getPermissionAllowanceLimit(permissionOptions);
    });
  }).then(limitResponse => {
    return res.json({
      limit: limitResponse.isInfinite() ? undefined : limitResponse.getLimit(),
      isInfinite: limitResponse.isInfinite(),
    });
  }).catch(err => {
    return next(err);
  });
});

module.exports = router;

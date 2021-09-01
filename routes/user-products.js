'use strict';

const Promise = require('bluebird');
const express = require('express');
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
} = require('@funnelytics/shared-data');

const ExternalServiceStatusConstants = require('../lib/commerce/subscriptions/external-services/constants/ExternalServiceStatusConstants');
const PermissionConflict = require('../lib/account/PermissionConflict');
const PermissionConflictConstants = require('../lib/account/permission-conflict/PermissionConflictConstants');

const router = express.Router();

// POST /, /create
router.post(['/', '/create'], (req, res, next) => {
  let wasInConflict = false; // stores whether user permissions were in conflict prior to adding product
  let userId;
  req.body = JSONAPI.deserialize('user-product', req.body);
  return Promise.try(() => {
    return modelsDashboard.UserProduct.getSchema().validateAsync(req.body, {
      stripUnknown: true,
    });
  }).catch(err => {
    throw errors.fromJoi(err);
  }).then(body => {
    return BookshelfDashboard.transaction(transacting => {
      return Promise.props({
        user: modelsDashboard.User.forge().where({
          id: req.user.id,
        }).fetch({
          transacting,
          columns: ['role'],
        }),
        product: modelsDashboard.Product.forge().where({
          id: body.product,
        }).fetch({
          transacting,
          columns: ['external_action_required'],
        }),
      }).then(async ({ user, product }) => {
        if (user.get('role') < 5) {
          throw errors.predefined.generic.unauthorized;
        }
        userId = body.user;

        wasInConflict = await PermissionConflict.isInConflictAsync({
          userId,
          permissions: PermissionConflictConstants.PERMISSIONS_SESSIONS,
          transacting,
        });

        const externalStatus = product.get('external_action_required')
          ? ExternalServiceStatusConstants.ACTION_REQUIRED
          : null;

        return modelsDashboard.UserProduct.forge().save(_.merge(body, {
          external_status: externalStatus,
        }), {
          transacting,
        });
      });
    });
  }).then(userProduct => {
    return JSONAPI.serializeAsync('user-product', userProduct.toJSON());
  }).then(body => {
    return res.status(201).json(body);
  }).then(async () => {
    if (!userId) {
      return null;
    }

    return BookshelfDashboard.transaction(transacting => {
      return PermissionConflict.announceConflictChange({
        userId,
        permissions: PermissionConflictConstants.PERMISSIONS_SESSIONS,
        previousState: wasInConflict,
        transacting,
      });
    });
  }).catch(err => {
    return next(err);
  });
});

// GET /:id, /find/:id
router.get(['/:id', '/find/:id'], (req, res, next) => {
  return BookshelfDashboard.transaction(transacting => {
    return modelsDashboard.User.forge().where({
      id: req.user.id,
    }).fetch({
      transacting,
      columns: ['role'],
    }).then(user => {
      if (user.get('role') < 5) {
        throw errors.predefined.generic.unauthorized;
      }
      return modelsDashboard.UserProduct.forge().where(req.query.filter || {}).fetchAll({
        transacting,
      });
    });
  }).then(userProduct => {
    return JSONAPI.serializeAsync('user-product', userProduct.toJSON());
  }).then(body => {
    return res.json(body);
  }).catch(err => {
    return next(err);
  });
});

// GET /, /find
router.get(['/', '/find'], (req, res, next) => {
  return BookshelfDashboard.transaction(transacting => {
    return modelsDashboard.User.forge().where({
      id: req.user.id,
    }).fetch({
      transacting,
      columns: ['role'],
    }).then(user => {
      if (user.get('role') > 4) {
        const queryFilter = _.get(req, ['query', 'filter'], {});
        const adminWhereClause = _.merge({
          user: req.user.id,
        }, queryFilter);

        return modelsDashboard.UserProduct.forge().where(adminWhereClause).fetchAll({
          transacting,
        });
      }
      return modelsDashboard.UserProduct.forge().where({
        user: req.user.id,
      }).fetchAll({
        withRelated: req.query.include || [],
        transacting,
      });
    });
  }).then(userProducts => {
    return JSONAPI.serializeAsync('user-product', userProducts.toJSON());
  }).then(body => {
    return res.json(body);
  }).catch(err => {
    return next(err);
  });
});

// DELETE /:id, /delete/:id
router.delete(['/:id', '/delete/:id'], (req, res, next) => {
  let wasInConflict = false; // stores whether user permissions were in conflict prior to removing product
  let userId;

  return BookshelfDashboard.transaction(transacting => {
    return modelsDashboard.User.forge().where({
      id: req.user.id,
    }).fetch({
      transacting,
      columns: ['role'],
    }).then(async user => {
      if (user.get('role') < 5) {
        throw errors.predefined.generic.unauthorized;
      }

      const userProduct = await modelsDashboard.UserProduct.forge().where({
        id: req.params.id,
      }).fetch({
        columns: ['id', 'user'],
        transacting,
      });

      if (!userProduct) {
        throw errors.predefined.generic.nonexistent;
      }

      userId = userProduct.get('user');

      [wasInConflict] = await Promise.all([
        PermissionConflict.isInConflictAsync({
          userId,
          permissions: PermissionConflictConstants.PERMISSIONS_SESSIONS,
          transacting,
        }),
      ]);

      return modelsDashboard.UserProduct.forge().where({
        id: req.params.id,
      }).destroy({
        transacting,
      });
    });
  }).then(userProduct => {
    return JSONAPI.serializeAsync('user-product', userProduct.toJSON());
  }).then(body => {
    return res.json(body);
  }).then(async () => {
    if (!userId) {
      return null;
    }

    return BookshelfDashboard.transaction(transacting => {
      return Promise.all([
        PermissionConflict.announceConflictChange({
          userId,
          permissions: PermissionConflictConstants.PERMISSIONS_SESSIONS,
          previousState: wasInConflict,
          transacting,
        }),
      ]);
    });
  }).catch(err => {
    return next(err);
  });
});

module.exports = router;

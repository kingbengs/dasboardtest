'use strict';

const express = require('express');

const {
  serializer: JSONAPI,
  models: {
    dashboard: modelsDashboard,
  },
  databases: {
    dashboard: BookshelfDashboard,
  },
  errors: {
    predefined: {
      generic: {
        forbidden: ForbiddenError,
      },
    },
  },
} = require('@funnelytics/shared-data');

const ExternalServiceManager = require('../lib/commerce/subscriptions/external-services/ExternalServiceManager');
const ExternalServiceConfig = require('../lib/commerce/subscriptions/external-services/config/ExternalServiceConfig');
const ExternalServiceToUpdate = require('../lib/commerce/subscriptions/options/post-webhook/update-external-services/ExternalServiceToUpdate');
const ExternalServiceTypeConstants = require('../lib/commerce/subscriptions/external-services/constants/ExternalServiceTypeConstants');

const router = express.Router();

router.get('/disable-external/:id', (req, res, next) => {
  return BookshelfDashboard.knex.transaction(async transacting => {
    const adminUser = await modelsDashboard.User.forge().query(qb => {
      qb.where('id', req.user.id);
      qb.where('role', '>', 4);
    }).fetch({
      transacting,
      columns: ['id'],
    });

    if (!adminUser) {
      throw ForbiddenError;
    }

    const externalUserProduct = await modelsDashboard.UserProduct.forge().where({
      id: req.params.id,
    }).fetch({
      transacting,
      columns: [
        'id',
        'user',
        'product',
      ],
    });

    return {
      userId: externalUserProduct.get('user'),
      recordId: req.params.id,
      serviceId: externalUserProduct.get('product'),
    };
  }).then(({
    userId,
    recordId,
    serviceId,
  }) => {
    const manager = new ExternalServiceManager(ExternalServiceConfig.createFromType(ExternalServiceTypeConstants.PRODUCTS));
    return manager.updateExternalService(
      new ExternalServiceToUpdate({
        serviceId,
        recordId,
        userId,
        activating: false,
      }),
    );
  }).then(success => {
    return res.json({
      success,
    });
  }).catch(next);
});

// GET /:id, /find/:id
router.get(['/:id', '/find/:id'], (req, res, next) => {
  return modelsDashboard.Product.forge().where({
    id: req.params.id,
  }).fetch().then(product => {
    return JSONAPI.serializeAsync('product', product.toJSON());
  }).then(body => {
    return res.json(body);
  }).catch(err => {
    return next(err);
  });
});

// GET /, /find
router.get(['/', '/find'], (req, res, next) => {
  return modelsDashboard.Product.forge().fetchAll().then(products => {
    return JSONAPI.serializeAsync('product', products.toJSON());
  }).then(body => {
    return res.json(body);
  }).catch(err => {
    return next(err);
  });
});

module.exports = router;

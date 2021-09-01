'use strict';

const Promise = require('bluebird');
const {
  models: {
    dashboard: modelsDashboard,
  },
  databases: {
    dashboard: BookshelfDashboard,
  },
  serializer: JSONAPI,
} = require('@funnelytics/shared-data');

const express = require('express');

const router = express.Router();

const SubscriptionStatuses = require('../lib/subscriptions/SubscriptionStatuses');

const ActiveStatuses = Object.freeze([
  SubscriptionStatuses.Active,
  SubscriptionStatuses.PendingCancel,
]);

// GET /, /find
router.get(['/', '/find'], (req, res, next) => {
  // Get woo commerce subscriptions currently active for the user
  return Promise.try(() => {
    return BookshelfDashboard.transaction(transacting => {
      return modelsDashboard.Subscription.forge().query(qb => {
        qb.where('user', req.user.id);
        qb.whereIn('status', ActiveStatuses);
      }).fetchAll({
        transacting,
        withRelated: [
          {
            subscription_product(qb) {
              qb.column('id', 'membership');
            },
            'subscription_product.membership': function (qb) {
              qb.column('id', 'name');
            },
          },
        ],
        columns: [
          'id',
          'user',
          'subscription_product',
          'status',
          'next_payment',
        ],
      });
    });
  }).then(wooUserSubscriptions => {
    return JSONAPI.serializeAsync('woo-user-subscription', wooUserSubscriptions.toJSON());
  }).then(body => {
    return res.json(body);
  }).catch(err => {
    return next(err);
  });
});

module.exports = router;

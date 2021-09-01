'use strict';

const Promise = require('bluebird');
const {
  models: {
    dashboard: modelsDashboard,
  },
  serializer: JSONAPI,
} = require('@funnelytics/shared-data');

const express = require('express');
const SubscriptionsManager = require('../lib/commerce/subscriptions/SubscriptionsManager');
const RecurlyManagerEngine = require('../lib/commerce/subscriptions/manager-engines/RecurlyManagerEngine');

const router = express.Router();

// GET /, /find
router.get(['/', '/find'], (req, res, next) => {
  return Promise.try(() => {
    // TODO: permission check (possibly adding admin permission helpers into permission check classes)

    return modelsDashboard.RecurlyUserSubscription.forge().where({
      user: req.user.id,
    }).fetchAll({
      withRelated: [
        {
          subscription(qb) {
            qb.column('id', 'name');
          },
        },
      ],
      columns: [
        'id',
        'status',
        'user',
        'subscription',
        'term_ends_at',
      ],
    }).then(userSubscription => {
      return JSONAPI.serializeAsync('recurly-user-subscription', userSubscription.toJSON());
    }).then(body => {
      return res.json(body);
    });
  }).catch(err => {
    return next(err);
  });
});

// GET /:id, /delete/:id
router.delete(['/:id', '/delete/:id'], (req, res, next) => {
  return Promise.try(() => {
    const userId = req.user.id;
    const manager = new SubscriptionsManager(new RecurlyManagerEngine(userId));
    const subscriptionId = req.params.id;
    return manager.cancelSubscriptionAsync(subscriptionId).then(confirmation => {
      return res.json(confirmation);
    });
  }).catch(err => {
    if (err.statusCode === 404) {
      return res.json({});
    }
    return next(err);
  });
});

module.exports = router;

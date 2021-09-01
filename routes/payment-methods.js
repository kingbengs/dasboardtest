'use-strict';

const express = require('express');
const SubscriptionsManager = require('../lib/commerce/subscriptions/SubscriptionsManager');
const RecurlyManagerEngine = require('../lib/commerce/subscriptions/manager-engines/RecurlyManagerEngine');

const router = express.Router();

// POST /, /create
router.post(['/', '/create'], (req, res, next) => {
  const userId = req.user.id;
  const manager = new SubscriptionsManager(new RecurlyManagerEngine(userId));

  /*
  if (req.body.three_ds_token) {
    purchase.three_d_secure_action_result_token_id = req.body.three_ds_token;
  }
  */

  const token = req.body.token;
  const fingerprint = req.body.fingerprint;
  return manager.setPaymentMethodAsync(token, fingerprint).then(methods => {
    return res.json(methods);
  }).catch(err => {
    if (err.status === 404 || err.status === 422 || err.statusCode === 422) {
      return res.status(404).json(err);
    }
    return next(err);
  });
});

// GET /, /find
router.get(['/', '/find'], (req, res, next) => {
  const userId = req.user.id;
  const manager = new SubscriptionsManager(new RecurlyManagerEngine(userId));

  return manager.getPaymentMethodAsync().then(methods => {
    return res.json(methods);
  }).catch(err => {
    if (err.statusCode === 404) {
      return res.json({});
    }
    return next(err);
  });
});

// DELETE /, /delete
router.delete(['/', '/delete'], (req, res, next) => {
  const userId = req.user.id;
  const manager = new SubscriptionsManager(new RecurlyManagerEngine(userId));

  return manager.unsetPaymentMethodAsync().then(methods => {
    return res.json(methods);
  }).catch(err => {
    if (err.statusCode === 404) {
      return res.json({});
    }
    return next(err);
  });
});

module.exports = router;

const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_KEY);
/*const _ = require('lodash');
const Promise = require('bluebird');*/

// GET /, /find
router.get(['/:id', '/find/:id'], (req, res, next) => stripe.skus.retrieve(req.params.id).then(sku => res.json(sku)).catch(err => next(err)));


// GET /, /find
/*
router.get(['/:id', '/find/:id'], (req, res, next) => {
  return stripe.skus.retrieve(req.params.id).then(sku => {
    return Promise.props({
      sku,
      product: stripe.products.retrieve(sku.product)
    });
  }).then(result => {
    return res.json(_.extend(result.sku, {
      product: result.product
    }));
  }).catch(err => {
    return next(err);
  });
});
*/

module.exports = router;

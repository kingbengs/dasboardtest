const express = require('express');

const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_KEY);

// GET /, /find
router.get(['/', '/find'], (req, res, next) => {
  return stripe.products.list({
    limit: 100,
  }).then(products => {
    return res.json(products.data);
  }).catch(err => {
    return next(err);
  });
});

/*
// GET /, /find
router.get(['/:id', '/find/:id'], (req, res, next) => {
  return stripe.skus.retrieve(req.params.id).then(product => {
    return res.json(product.data);
  }).catch(err => {
    return next(err);
  });
});
*/

module.exports = router;

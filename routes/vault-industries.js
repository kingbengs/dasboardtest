const express = require('express');

const router = express.Router();
const {
  serializer: JSONAPI,
  models: {
    dashboard: modelsDashboard,
  },
} = require('@funnelytics/shared-data');

// GET /, /find
router.get(['/', '/find'], (req, res, next) => {
  return modelsDashboard.VaultIndustry.forge().fetchAll().then(industries => {
    return JSONAPI.serializeAsync('vault-industry', industries.toJSON());
  }).then(body => {
    return res.json(body);
  }).catch(err => {
    return next(err);
  });
});

module.exports = router;

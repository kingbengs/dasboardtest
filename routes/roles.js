const express = require('express');

const router = express.Router();

const {
  serializer: JSONAPI,
  models: {
    dashboard: modelsDashboard,
  },
} = require('@funnelytics/shared-data');

// GET /:id, /find/:id
router.get(['/:id', '/find/:id'], (req, res, next) => {
  return modelsDashboard.Role.forge().where('id', req.params.id).fetch().then(role => {
    return JSONAPI.serializeAsync('role', role.toJSON());
  }).then(body => {
    return res.json(body);
  }).catch(err => {
    return next(err);
  });
});

// GET /, /find
router.get(['/', '/find'], (req, res, next) => {
  return modelsDashboard.Role.forge().fetchAll().then(role => {
    return JSONAPI.serializeAsync('role', role.toJSON());
  }).then(body => {
    return res.json(body);
  }).catch(err => {
    return next(err);
  });
});

module.exports = router;

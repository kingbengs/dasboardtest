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
  return modelsDashboard.Membership.forge().where('id', req.params.id).fetch().then(membership => {
    return JSONAPI.serializeAsync('membership', membership.toJSON());
  }).then(body => {
    return res.json(body);
  }).catch(err => {
    return next(err);
  });
});

// GET /, /find
router.get(['/', '/find'], (req, res, next) => {
  return modelsDashboard.Membership.forge().fetchAll().then(memberships => {
    return JSONAPI.serializeAsync('membership', memberships.toJSON());
  }).then(body => {
    return res.json(body);
  }).catch(err => {
    return next(err);
  });
});

module.exports = router;

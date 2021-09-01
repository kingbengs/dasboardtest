'use strict';

const express = require('express');
const Bluebird = require('bluebird');

const router = express.Router();
const {
  serializer: JSONAPI,
  errors,
  models: {
    dashboard: modelsDashboard,
  },
} = require('@funnelytics/shared-data');

// POST /, /create
router.post(['/', '/create'], (req, res, next) => {
  req.body = JSONAPI.deserialize('icon_folder', req.body);
  req.body.user = req.user.id;
  return Bluebird.try(() => {
    return modelsDashboard.IconFolder.getSchema().validateAsync(req.body, {
      stripUnknown: true,
    });
  }).catch(err => {
    throw errors.fromJoi(err);
  }).then(validated => {
    return modelsDashboard.IconFolder.forge(validated).save(null, {
      patch: false,
    });
  }).then(folder => { return JSONAPI.serializeAsync('icon_folder', folder.toJSON()); })
    .then(body => { return res.status(201).json(body); })
    .catch(err => { return next(err); });
});

// GET /, /find
router.get(['/', '/find'], (req, res, next) => {
  return modelsDashboard.IconFolder.forge(req.query.filter || {}).where({
    user: req.user.id,
  }).fetchAll({
    withRelated: req.query.include || [],
  }).then(folders => { return JSONAPI.serializeAsync('icon_folder', folders.toJSON()); })
    .then(body => { return res.json(body); })
    .catch(err => { return next(err); });
});

// GET /:id, /find/:id
router.get(['/:id', '/find/:id'], (req, res, next) => {
  return modelsDashboard.IconFolder.forge().where({
    id: req.params.id,
    user: req.user.id,
  }).fetch({
    withRelated: req.query.include || [],
  }).then(folder => { return JSONAPI.serializeAsync('icon_folder', folder.toJSON()); })
    .then(body => { return res.json(body); })
    .catch(err => { return next(err); });
});

// PATCH /:id, /edit/:id
router.patch(['/:id', '/edit/:id'], (req, res, next) => {
  req.body = JSONAPI.deserialize('icon_folder', req.body);
  return Bluebird.try(() => {
    return modelsDashboard.IconFolder.getSchema().validateAsync(req.body, {
      stripUnknown: true,
    });
  }).catch(err => {
    throw errors.fromJoi(err);
  }).then(validated => {
    return modelsDashboard.IconFolder.forge().where({
      id: req.params.id,
      user: req.user.id,
    }).save(validated, {
      patch: true,
      returning: '*',
    });
  }).then(folder => {
    if (!folder) {
      throw errors.predefined.generic.unauthorized;
    }
    return JSONAPI.serializeAsync('icon_folder', folder.toJSON());
  })
    .then(body => { return res.json(body); })
    .catch(err => { return next(err); });
});

// DELETE /:id, /delete/:id
router.delete(['/:id', '/delete/:id'], (req, res, next) => {
  return modelsDashboard.IconFolder.forge().where({
    id: req.params.id,
    user: req.user.id,
  }).destroy().then(folder => {
    if (!folder) {
      throw errors.predefined.generic.unauthorized;
    }
    return JSONAPI.serializeAsync('icon_folder', folder.toJSON());
  })
    .then(body => { return res.json(body); })
    .catch(err => { return next(err); });
});

module.exports = router;

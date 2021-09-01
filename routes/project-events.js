const express = require('express');
const _ = require('lodash');
// const Promise = require('bluebird');
const {
  serializer: JSONAPI,
  models: {
    dashboard: modelsDashboard,
  },
} = require('@funnelytics/shared-data');

const router = express.Router();

// POST /, /create
router.post(['/', '/create'], (req, res, next) => {
  return JSONAPI.deserializeAsync('project-event', req.body).then(body => {
    req.body = body;
  }).then(() => {
    delete req.body.id;
    return modelsDashboard.ProjectEvent.forge(req.body).save(null, {
      returning: '*',
    });
  }).then(projectEvent => {
    return JSONAPI.serializeAsync('project-event', projectEvent.toJSON());
  }).then(body => {
    return res.status(201).json(body);
  }).catch(err => {
    return next(err);
  });
});

// PATCH /:id, /edit/:id
router.patch(['/:id', '/edit/:id'], (req, res, next) => {
  return JSONAPI.deserializeAsync('project-event', req.body).then(body => {
    req.body = body;
  }).then(() => {
    delete req.body.id;
    return modelsDashboard.ProjectEvent.forge().where({
      id: req.params.id,
    }).save(req.body, {
      patch: true,
      method: 'update',
      returning: '*',
    });
  }).then(projectEvent => {
    return JSONAPI.serializeAsync('project-event', projectEvent.toJSON());
  }).then(body => {
    return res.status(201).json(body);
  }).catch(err => {
    return next(err);
  });
});

// GET /:id, /find/:id
router.get(['/:id', '/find/:id'], (req, res, next) => {
  return modelsDashboard.ProjectEvent.forge().query(qb => {
    qb.whereIn('project_events.project', qb2 => {
      qb2.select('projects.id').from('projects');
      qb2.where('projects.user', req.user.id);
    });
    qb.where('project_events.id', req.params.id);
  }).fetchAll({
    withRelated: req.query.include || [],
  }).then(projectEvent => {
    return JSONAPI.serializeAsync('project-event', projectEvent.toJSON());
  }).then(body => {
    return res.json(body);
  }).catch(err => {
    return next(err);
  });
});

// GET /, /find
router.get(['/', '/find'], (req, res, next) => {
  return modelsDashboard.ProjectEvent.forge().query(qb => {
    qb.whereIn('project_events.project', qb2 => {
      qb2.select('projects.id').from('projects');
      qb2.where('projects.user', req.user.id);
    });
    _.each(req.query.filter || {}, (value, key) => {
      qb.where(key, value);
    });
  }).fetchAll({
    withRelated: req.query.include || [],
  }).then(projectEvents => {
    return JSONAPI.serializeAsync('project-event', projectEvents.toJSON());
  }).then(body => {
    return res.json(body);
  }).catch(err => {
    return next(err);
  });
});

// DELETE /:id, /delete/:id
router.delete(['/:id', '/delete/:id'], (req, res, next) => {
  return modelsDashboard.ProjectEvent.forge().where({
    id: req.params.id,
  }).destroy(req.body).then(projectEvent => {
    return JSONAPI.serializeAsync('project-event', projectEvent.toJSON());
  }).then(body => {
    return res.status(201).json(body);
  }).catch(err => {
    return next(err);
  });
});

module.exports = router;

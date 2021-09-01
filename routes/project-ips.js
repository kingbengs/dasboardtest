'use strict';

const express = require('express');
const Bluebird = require('bluebird');

const router = express.Router();
const Joi = require('@hapi/joi');
const _ = require('lodash');

const {
  serializer: JSONAPI,
  errors,
  models: {
    dashboard: modelsDashboard,
  },
  databases: {
    dashboard: BookshelfDashboard,
  },
} = require('@funnelytics/shared-data');

// NOTE: prime candidate for the permission manager

// POST /, /create
router.post(['/', '/create'], (req, res, next) => {
  req.body = JSONAPI.deserialize('project-ip', req.body);
  return Bluebird.try(() => {
    return modelsDashboard.ProjectIP.getSchema().validateAsync(req.body, {
      stripUnknown: true,
    });
  }).catch(err => {
    throw errors.fromJoi(err);
  }).then(validated => {
    return BookshelfDashboard.transaction(transacting => {
      return modelsDashboard.User.forge().where(qb => {
        qb.where('id', req.user.id);
        qb.whereIn('id', function () {
          this.select('projects.user').from('projects');
          this.where('projects.id', validated.project);
          this.whereNull('projects.deleted_at');
          this.unionAll(function () {
            this.select('project_clients.user').from('project_clients');
            this.where('project_clients.project', validated.project);
            this.where('project_clients.user', req.user.id);
            this.where('project_clients.permissions', '>=', 1);
          });
        });
      }).count({
        transacting,
      }).then(count => {
        if (count <= 0) {
          throw errors.predefined.generic.unauthorized;
        }
        return modelsDashboard.ProjectIP.forge(validated).save(null, {
          transacting,
          returning: '*',
        });
      });
    });
  }).then(ip => {
    return JSONAPI.serializeAsync('project-ip', ip.toJSON());
  }).then(body => {
    return res.status(201).json(body);
  }).catch(err => {
    return next(err);
  });
});

// PATCH /:id, /edit/:id
router.patch(['/:id', '/edit/:id'], (req, res, next) => {
  req.body = JSONAPI.deserialize('project-ip', req.body);
  return Bluebird.try(() => {
    return modelsDashboard.ProjectIP.getSchema().validateAsync(req.body, {
      stripUnknown: true,
    });
  }).catch(err => {
    throw errors.fromJoi(err);
  }).then(validated => {
    return modelsDashboard.ProjectIP.forge().where(qb => {
      qb.where('project_ips.id', req.params.id);
      qb.whereIn('project_ips.project', function () {
        this.select('projects.id').from('projects');
        this.where('projects.user', req.user.id);
        this.whereNull('projects.deleted_at');
        this.unionAll(function () {
          this.select('project_clients.project').from('project_clients');
          this.where('project_clients.user', req.user.id);
          this.where('project_clients.permissions', '>=', 1);
        });
      });
    }).save(validated, {
      patch: true,
      method: 'update',
      returning: '*',
    });
  }).then(ip => {
    return JSONAPI.serializeAsync('project-ip', ip.toJSON());
  }).then(body => {
    return res.status(200).json(body);
  }).catch(err => {
    return next(err);
  });
});

// GET /my-ip
router.get('/my-ip', (req, res, next) => {
  let ip = req.ip;
  const header = req.headers['x-forwarded-for'];
  if (header) {
    ip = header.split(', ')[0];
  }
  return res.status(200).json({
    ip,
  });
});

// GET /, /find
router.get(['/', '/find'], (req, res, next) => {
  return modelsDashboard.ProjectIP.forge().where(qb => {
    qb.whereIn('project_ips.project', function () {
      this.select('projects.id').from('projects');
      this.where('projects.user', req.user.id);
      this.whereNull('projects.deleted_at');
      this.unionAll(function () {
        this.select('project_clients.project').from('project_clients');
        this.where('project_clients.user', req.user.id);
        this.where('project_clients.permissions', '>=', 0);
      });
    });
    _.each(req.query.filter || {}, (value, key) => {
      qb.where(key, value);
    });
  }).fetchAll().then(ips => {
    return JSONAPI.serializeAsync('project-ip', ips.toJSON());
  }).then(body => {
    return res.status(200).json(body);
  }).catch(err => {
    return next(err);
  });
});

// GET /:id, /find/:id
router.get(['/:id', '/find/:id'], (req, res, next) => {
  return BookshelfDashboard.transaction(transacting => {
    return modelsDashboard.Project.forge().where(qb => {
      qb.where('id', function () {
        this.select('project').from('project_ips');
        this.where('id', req.params.id);
      });
    }).fetch({
      transacting,
      columns: ['id'],
    }).then(project => {
      return modelsDashboard.User.forge().where(qb => {
        qb.where('id', req.user.id);
        qb.whereIn('id', function () {
          this.select('projects.user').from('projects');
          this.where('projects.id', project.get('id'));
          this.whereNull('projects.deleted_at');
          this.unionAll(function () {
            this.select('project_clients.user').from('project_clients');
            this.where('project_clients.project', project.get('id'));
            this.where('project_clients.user', req.user.id);
            this.where('project_clients.permissions', '>=', 1);
          });
        });
      }).count({
        transacting,
      });
    }).then(count => {
      if (count <= 0) {
        throw errors.predefined.generic.unauthorized;
      }
      return modelsDashboard.ProjectIP.forge().where({
        id: req.params.id,
      }).fetch({
        columns: '*',
        transacting,
      });
    });
  }).then(ip => {
    return JSONAPI.serializeAsync('project-ip', ip.toJSON());
  }).then(body => {
    return res.status(201).json(body);
  }).catch(err => {
    return next(err);
  });
});

// DELETE /:id, /delete/:id
router.delete(['/:id', '/delete/:id'], (req, res, next) => {
  return BookshelfDashboard.transaction(transacting => {
    return modelsDashboard.ProjectIP.forge().where({
      id: req.params.id,
    }).fetch({
      transacting,
      columns: ['project'],
    }).then(projectIP => {
      return modelsDashboard.User.forge().where(qb => {
        qb.where('id', req.user.id);
        qb.whereIn('id', function () {
          this.select('projects.user').from('projects');
          this.where('projects.id', projectIP.get('project'));
          this.whereNull('projects.deleted_at');
          this.unionAll(function () {
            this.select('project_clients.user').from('project_clients');
            this.where('project_clients.project', projectIP.get('project'));
            this.where('project_clients.user', req.user.id);
            this.where('project_clients.permissions', '>=', 1);
          });
        });
      }).count({
        transacting,
      });
    }).then(count => {
      if (count <= 0) {
        throw errors.predefined.generic.unauthorized;
      }
      return modelsDashboard.ProjectIP.forge().where({
        id: req.params.id,
      }).destroy({
        transacting,
      });
    });
  }).then(ip => {
    return JSONAPI.serializeAsync('project-ip', ip.toJSON());
  }).then(body => {
    return res.status(200).json(body);
  }).catch(err => {
    return next(err);
  });
});

module.exports = router;

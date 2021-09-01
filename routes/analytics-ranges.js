'use strict';

const express = require('express');
const moment = require('moment');

const router = express.Router();
const {
  models: {
    dashboard: modelsDashboard,
  },
  databases: {
    dashboard: BookshelfDashboard,
  },
  permissions: {
    PermissionManager,
    PermissionWrapper,
    PermissionScope,
    FetchPermissionOptions,
    AccessLevelInput,
  },
  errors,
  serializer: JSONAPI,
} = require('@funnelytics/shared-data');
const {
  constants: {
    Permissions,
  },
} = require('@funnelytics/utilities');
const Promise = require('bluebird');
const _ = require('lodash');
const Joi = require('@hapi/joi');

router.get('/', (req, res, next) => {
  return Promise.try(async () => {
    const projectId = _.get(req, ['query', 'filter', 'project'], null);
    await Joi.object().keys({
      project: Joi.string().uuid({
        version: ['uuidv4'],
      }).required(),
    }).validateAsync({
      project: projectId,
    }).catch(err => {
      throw errors.fromJoi(err);
    });

    return BookshelfDashboard.transaction(async transacting => {
      const project = await modelsDashboard.Project.forge().where({
        id: projectId,
      }).fetch({
        columns: ['id', 'user'],
        transacting,
      });

      if (!project) {
        throw errors.predefined.generic.nonexistent;
      }

      const permissionManager = new PermissionManager(req.user.id);
      const permissionOptions = new FetchPermissionOptions({
        transacting,
        // Consider checking for TYPE_ANALYTICS permission here
        permission: new PermissionWrapper(Permissions.TYPE_STARTER),
        scope: new PermissionScope({
          type: Permissions.SCOPE_PROJECT,
          instance: project.get('id'),
        }),
        accessLevel: new AccessLevelInput({
          accessLevel: AccessLevelInput.READ,
        }),
      });

      const { hasReadPermission } = await Promise.props({
        hasReadPermission: permissionManager.fetchPermissionResponse(permissionOptions),
      });

      if (!hasReadPermission) {
        throw errors.predefined.generic.forbidden;
      }

      return modelsDashboard.AnalyticsRange.forge().where({
        user: project.get('user'),
      }).fetchAll({
        transacting,
      });
    }).then(analyticsRanges => {
      return JSONAPI.serializeAsync('analytics-range', analyticsRanges.toJSON());
    }).then(serialized => {
      return res.json(serialized);
    });
  }).catch(err => {
    return next(err);
  });
});


router.post(['/admin'], (req, res, next) => {
  return Promise.try(async () => {
    const auth = _.replace(_.get(req, ['headers', 'authorization']), 'Basic ', '');
    if (!auth) {
      throw errors.predefined.generic.forbidden;
    }
    const bufferedAuth = Buffer.from(auth, 'base64');
    const decodedAuth = bufferedAuth.toString('utf-8');
    const [username, password] = decodedAuth.split(':');
    if (username !== 'analytics-ranges-admin' || password !== process.env.ANALYTICS_RANGES_PASSWORD) {
      throw errors.predefined.generic.forbidden;
    }
    const headerDate = _.get(req, ['headers', 'date']);
    if (!headerDate) {
      throw errors.predefined.generic.forbidden;
    }

    const headerMoment = moment(headerDate);
    const momentInAMinute = moment(new Date().toISOString()).add(1, 'minutes');
    const momentAMinuteAgo = moment(new Date().toISOString()).subtract(1, 'minutes');
    // Prevent replay attacks from spamming our database:
    if (headerMoment.isAfter(momentInAMinute) || headerMoment.isBefore(momentAMinuteAgo)) {
      throw errors.predefined.generic.forbidden;
    }

    const validated = await modelsDashboard.AnalyticsRange.getSchema().validateAsync(
      req.body,
    ).catch(err => {
      throw errors.fromJoi(err);
    });

    return BookshelfDashboard.transaction(async transacting => {
      const user = await modelsDashboard.User.forge().where({
        id: validated.user,
      }).fetch({
        columns: ['id'],
        transacting,
      });

      if (!user) {
        throw errors.predefined.generic.nonexistent;
      }

      return modelsDashboard.AnalyticsRange.forge().save(validated, {
        transacting,
        returning: ['id'],
      });
    });
  }).then(response => {
    return res.json(response);
  }).catch(err => {
    return next(err);
  });
});

module.exports = router;

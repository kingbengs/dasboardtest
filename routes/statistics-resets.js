const express = require('express');

const router = express.Router();
const {
  models: {
    dashboard: modelsDashboard,
  },
  databases: {
    dashboard: BookshelfDashboard,
  },
  errors,
  serializer: JSONAPI,
} = require('@funnelytics/shared-data');
const Promise = require('bluebird');
const _ = require('lodash');

const WRITE_PERMISSIONS = 1;
const WRITE_PERMISSIONS_REQUIRED = true;

async function getResetStatsProject(req, projectId, transacting) {
  const { user, project } = await Promise.props({
    user: modelsDashboard.User
      .forge()
      .where({ id: req.user.id })
      .fetch({ transacting }),
    project: modelsDashboard.Project
      .forge()
      .where({
        id: projectId,
      }).fetch({
        columns: ['user'],
        transacting,
      }),
  });
  if (!user || !project) {
    throw errors.predefined.generic.unauthorized;
  }
  return project;
}

function assertResetStatsClientPermissions(req, projectId, transacting, write = false) {
  return modelsDashboard.ProjectClient
    .forge()
    .where({
      project: projectId,
      user: req.user.id,
    })
    .fetch({
      transacting,
      columns: ['permissions'],
    }).then(client => {
      if (!client) {
        throw errors.predefined.generic.unauthorized;
      }

      if (write && client.get('permissions') !== WRITE_PERMISSIONS) {
        throw errors.predefined.generic.unauthorized;
      }

      return true;
    });
}

router.get('/', (req, res, next) => {
  return Promise.try(() => {
    const projectId = _.get(req, ['query', 'filter', 'project'], null);
    return BookshelfDashboard.transaction(async transacting => {
      const project = await getResetStatsProject(req, projectId, transacting);

      // Check client access
      if (project.get('user') !== req.user.id) {
        await assertResetStatsClientPermissions(req, projectId, transacting);
      }

      return modelsDashboard.StatisticsReset
        .forge()
        .where({
          project: projectId,
        })
        .fetch({
          transacting,
          // the * is required here to make it function like the save method on create (below)
          columns: ['*'],
        });
    })
      .then(statsReset => {
        if (!statsReset) {
          throw errors.predefined.generic.nonexistent;
        }

        return JSONAPI.serializeAsync('statistics-reset', statsReset.toJSON());
      })
      .then(serialized => {
        return res.json(serialized);
      });
  })
    .catch(err => {
      return next(err);
    });
});


router.post(['/', '/create'], (req, res, next) => {
  return Promise.try(() => {
    const newReset = JSONAPI.deserialize('statistics-reset', req.body);
    const projectId = _.get(newReset, 'project', null);
    return BookshelfDashboard.transaction(async transacting => {
      const project = await getResetStatsProject(req, projectId, transacting);

      // Check client access
      if (project.get('user') !== req.user.id) {
        await assertResetStatsClientPermissions(req, projectId, transacting, WRITE_PERMISSIONS_REQUIRED);
      }

      const validated = await Promise.try(() => {
        return modelsDashboard.StatisticsReset.getSchema().validateAsync(
          newReset,
          { stripUnknown: true },
        );
      }).catch(err => {
        throw errors.fromJoi(err);
      });

      return modelsDashboard.StatisticsReset
        .forge()
        .save(
          validated,
          { transacting },
        );
    })
      .then(statsReset => {
        if (!statsReset) {
          throw errors.predefined.generic.nonexistent;
        }

        return JSONAPI.serializeAsync('statistics-reset', statsReset.toJSON());
      })
      .then(serialized => {
        return res.json(serialized);
      });
  })
    .catch(err => {
      return next(err);
    });
});


module.exports = router;

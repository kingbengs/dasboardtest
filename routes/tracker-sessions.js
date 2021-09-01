'use strict';

const express = require('express');

const router = express.Router();
const Promise = require('bluebird');

const {
  serializer: JSONAPI,
  errors,
  models: {
    tracking: modelsTracking,
  },
  databases: {
    tracking: BookshelfTracking,
    dashboard: BookshelfDashboard,
  },
  users: {
    User,
    meta: {
      UserMetaKeys,
    },
  },
  permissions: {
    PermissionManager,
    PermissionWrapper,
    PermissionScope,
    FetchPermissionOptions,
    AccessLevelInput,
  },
} = require('@funnelytics/shared-data');
const {
  constants: {
    Permissions,
  },
} = require('@funnelytics/utilities');
const _ = require('lodash');

const wrapAsync = require('../utils/asyncWrap');

const RequestUser = require('../lib/users/RequestUser');


router.get('/total-tracked', (req, res, next) => {
  return Promise.try(() => {
    return BookshelfDashboard.transaction(transacting => {
      const user = new RequestUser(req.user.id);

      return user.getSessionsCount({
        transacting,
      });
    }).then(totalCount => {
      return res.json({
        totalSessionsCount: totalCount,
      });
    });
  }).catch(next);
});


const getMonthlyTracked = (req, res) => {
  return BookshelfDashboard.transaction(async t => {
    const permissionManager = new PermissionManager(req.user.id);
    const permissionOptions = new FetchPermissionOptions({
      transacting: t,
      permission: new PermissionWrapper(Permissions.META_SESSIONS_USAGE_TIERS),
      scope: new PermissionScope({
        type: PermissionScope.TYPE_USER,
        instance: req.user.id,
      }),
      accessLevel: new AccessLevelInput({ accessLevel: AccessLevelInput.ADMIN }),
    });

    const permissionResponse = await permissionManager.fetchPermissionResponse(permissionOptions);

    if (!permissionResponse.getHasPermission()) {
      throw errors.predefined.generic.forbidden;
    }

    const user = new User(req.user.id);
    const sessionsTracked = await user.getMeta(UserMetaKeys.SESSIONS_TRACKED_MONTHLY);

    return res.json({
      sessionsCount: sessionsTracked || 0,
    });
  });
};

router.get('/monthly-tracked', wrapAsync(getMonthlyTracked));

// GET /, /find
router.get(['/', '/find'], (req, res, next) => {
  return Promise.try(() => {
    return BookshelfTracking.transaction(async t => {
      const hasProjectFilter = _.has(req.query, 'filter.project');
      if (hasProjectFilter) {
        // TODO: Use permissions for this...
        const isAllowedToQueryProject = await modelsTracking.Project.forge().where({
          id: _.get(req.query, 'filter.project'),
          user: req.user.id,
        }).count({
          transacting: t,
        }).then(count => {
          return count === '1';
        });

        if (!isAllowedToQueryProject) {
          throw errors.predefined.generic.forbidden;
        }
      }

      const model = modelsTracking.TrackerSession.forge().where(_.omit(req.query.filter, ['page', 'project']) || {}).query(qb => {
        if (hasProjectFilter) {
          qb.whereIn('id', function () {
            this.select('id').from('tracker_sessions');
            this.where('project', req.query.filter.project);
            this.orWhereIn('funnel', function () {
              this.select('id').from('funnels').where('project', req.query.filter.project);
            });
          });
        } else {
          qb.whereIn('project', function () {
            this.select('id').from('projects').where('user', req.user.id);
          });
        }
        if (req.query.isNotNull instanceof Array) {
          _.each(req.query.isNotNull, column => {
            qb.whereNotNull(column);
          });
        }
        if (req.query.include instanceof Array) {
          if (req.query.include.indexOf('profile.attrs') > -1 && req.query.query) {
            qb.whereIn('profile', function () {
              this.select('tracker_profile_attributes.profile');
              this.from('tracker_profile_attributes');
              this.where(
                'tracker_profile_attributes.value',
                'like',
                `%${req.query.query}%`,
              );
            });
          }
        }
      });
      return Promise.props({
        sessions: model.clone().query(qb => {
          if (req.query.order instanceof Object) {
            qb.orderBy(
              req.query.order.column || 'created_at',
              req.query.order.direction || 'DESC',
            );
          } else {
            qb.orderBy('created_at', 'DESC');
          }
        }).fetchPage({
          pageSize: 15,
          page: req.query.page || 1,
          transacting: t,
          withRelated: req.query.include || [],
        }),
        count: model.clone().count({
          transacting: t,
        }),
      });
    });
  }).then(result => {
    return JSONAPI.serializeAsync('tracker-session', result.sessions.toJSON(), {
      count: result.count,
    });
  }).then(body => {
    return res.json(body);
  }).catch(err => {
    return next(err);
  });
});

// GET /:id, /find/:id
// TODO: This needs to be fixed massively
router.get(['/:id', '/find/:id'], (req, res, next) => {
  BookshelfTracking.transaction(t => {
    return modelsTracking.TrackerSession.forge({
      id: req.params.id,
    }).query(qb => {
      qb.whereIn('project', function () {
        this.select('id').from('projects').where('user', req.user.id);
      });
    }).fetch({
      transacting: t,
      withRelated: req.query.include || [],
    });
  }).then(session => {
    if (!session) {
      throw errors.predefined.generic.nonexistent;
    }
    return JSONAPI.serializeAsync('tracker-session', session.toJSON());
  }).then(body => {
    return res.json(body);
  }).catch(err => {
    return next(err);
  });
});

// DELETE /:id, /find/:id
// TODO: This needs to be fixed massively
router.delete(['/:id', '/delete/:id'], (req, res, next) => {
  return modelsTracking.TrackerSession.forge().where({
    id: req.params.id,
  }).query(qb => {
    qb.whereIn('project', function () {
      this.select('id').from('projects').where('user', req.user.id);
    });
  }).destroy().then(session => {
    if (!session) {
      throw errors.predefined.generic.nonexistent;
    }
    return JSONAPI.serializeAsync('tracker-session', session.toJSON());
  }).then(body => {
    return res.json(body);
  }).catch(err => {
    return next(err);
  });
});

module.exports = router;

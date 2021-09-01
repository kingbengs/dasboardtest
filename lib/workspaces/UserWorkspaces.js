'use strict';

const _ = require('lodash');
const {
  Assertion,
} = require('@funnelytics/utilities');
const {
  models: {
    dashboard: modelsDashboard,
  },
} = require('@funnelytics/shared-data');
const Bluebird = require('bluebird');

class UserWorkspaces {
  constructor(userId) {
    this._setUserId(userId);
  }

  fetch({
    filter = {},
    withRelated = [],
    transacting = undefined,
  } = {}) {
    return Bluebird.try(() => {
      return modelsDashboard.Project.forge().where(filter).query(qb => {
        qb.whereIn('projects.id', whereInQuery => {
          whereInQuery.select('projects.id').from('projects');
          whereInQuery.where('projects.user', this._getUserId());
          whereInQuery.unionAll(unionQuery => {
            unionQuery.select('project_clients.project').from('project_clients');
            unionQuery.where('project_clients.user', this._getUserId());
          });
        });
      }).fetchAll({
        withRelated: _.uniq(['user', ...withRelated]),
        transacting,
      });
    });
  }

  _setUserId(userId) {
    Assertion.uuid(userId);

    this._userId = userId;
  }

  _getUserId() {
    return this._userId;
  }
}

module.exports = UserWorkspaces;

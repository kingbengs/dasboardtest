'use strict';

const Bluebird = require('bluebird');
const {
  errors,
  models: {
    dashboard: modelsDashboard,
  },
} = require('@funnelytics/shared-data');
const {
  Assertion,
  constants: {
    Upgrades,
  },
} = require('@funnelytics/utilities');
const RequestUser = require('../users/RequestUser');

/**
 * Throw appropriate errors based on what a user wants to do (but can't) with workspaces.
 */
class WorkspaceLimitHandler {
  constructor({
    requestUser,
  }) {
    this.setRequestUser(requestUser);
  }

  assert({
    transacting,
  } = {}) {
    return Bluebird.try(async () => {
      Assertion.transacting(transacting);

      const {
        limitResponse,
        current,
      } = await Bluebird.props({
        limitResponse: this.getRequestUser().getWorkspaceLimit({
          transacting,
        }),
        current: this.getRequestUser().getWorkspaceCount({
          transacting,
        }),
      });

      if (!limitResponse.isAtOrExceedsLimit(current)) {
        return true;
      }

      return Bluebird.reject(new errors.AppError(
        402,
        'Reached Workspace Limit',
        'You\'ve reached your workspace limit. To create a new workspace you need to upgrade your subscription.',
        {
          [Upgrades.SUGGESTED_ATTR]: Upgrades.PRO_SUBSCRIPTION,
        },
      ));

    });
    //* Careful if you choose to .then() here, there are a number of returns above that may need to be considered.
  }

  static lockAllWorkspaces({
    userId,
    transacting,
  } = {}) {
    return Bluebird.try(() => {
      Assertion.uuid(userId);
      Assertion.transacting(transacting);

      return modelsDashboard.Project.forge().where(qb => {
        qb.where('user', userId);
        qb.where('is_locked', false);
      }).save({
        is_locked: true,
      }, {
        transacting,
        patch: true,
        method: 'UPDATE',
        require: false,
      });
    });
  }

  setRequestUser(requestUser) {
    Assertion.instanceOf(requestUser, RequestUser);

    this._requestUser = requestUser;
  }

  getRequestUser() {
    return this._requestUser;
  }
}

module.exports = WorkspaceLimitHandler;

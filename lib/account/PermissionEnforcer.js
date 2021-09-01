'use strict';

const _ = require('lodash');
const Bluebird = require('bluebird');
const {
  Assertion,
} = require('@funnelytics/utilities');

const PermissionEnforcerConfig = require('./permission-enforcer/PermissionEnforcerConfig');
const RequestUser = require('../users/RequestUser');

/**
 * Terminates a subscription based on permission checks
 */
class PermissionEnforcer {
  constructor({
    config,
  }) {
    this.setConfig(config);
    this._areInitialPermissionsPresent = null;
  }

  enforce(options = {}) {
    return Bluebird.try(async () => {
      this.assertUserIsSet();
      this.assertAreInitialPermissionsPresent();
      const { transacting } = options;
      Assertion.transacting(transacting);
      const populatedOptions = _.merge(options, {
        userId: this.getUserId(),
      });

      const hasPermissions = await this.fetchState({
        transacting,
      });

      // Current state doesn't warrant handler running:
      if ((hasPermissions && this.getConfig().isRunOnAbsent()) || (!hasPermissions && this.getConfig().isRunOnPresent())) {
        return this.getReturnValue(options);
      }

      if (this.getConfig().isOnlyRunOnChange()) {
        // Change is required but none is detected:
        if (hasPermissions === this.areInitialPermissionsPresent()) {
          return this.getReturnValue(options);
        }
      }

      const enforcePermissions = this.getConfig().getHandlerPromise();

      return enforcePermissions(populatedOptions, this.getConfig());
    });
  }

  setConfig(config) {
    Assertion.instanceOf(config, PermissionEnforcerConfig);

    this._config = config;
  }

  setUserId(userId) {
    Assertion.uuid(userId);

    this._userId = userId;
  }

  hasUserId() {
    return Boolean(this.getUserId());
  }

  assertUserIsSet() {
    if (!this.getUserId()) {
      throw new Error('userId is not set on PermissionEnforcer, despite being required to run this operation.');
    }
  }

  fetchState({
    transacting,
  } = {}) {
    return Bluebird.try(() => {
      Assertion.transacting(transacting);
      this.assertUserIsSet();

      const requiredPermissions = this.getConfig().getRequiredPermissions();
      const requestUser = new RequestUser(this.getUserId());

      return Promise.map(requiredPermissions, permission => {
        return requestUser.hasPermission(permission, {
          transacting,
          admin: true,
        });
      }).then(resultArray => {
        return resultArray.every(hasPermission => {
          return hasPermission === true;
        });
      });
    });
  }

  fetchSetInitialState({
    transacting,
  } = {}) {
    return Bluebird.try(async () => {
      const hasAllPermissions = await this.fetchState({
        transacting,
      });

      this.setAreInitialPermissionsPresent(hasAllPermissions);

      return this.areInitialPermissionsPresent();
    });
  }

  setAreInitialPermissionsPresent(areInitialPermissionsPresent) {
    Assertion.boolean(areInitialPermissionsPresent);

    this._areInitialPermissionsPresent = areInitialPermissionsPresent;
  }

  getConfig() {
    return this._config;
  }

  getUserId() {
    return this._userId;
  }

  areInitialPermissionsPresent() {
    return this._areInitialPermissionsPresent;
  }

  isInitialPermissionsPresentSet() {
    return this.areInitialPermissionsPresent() !== null;
  }

  assertAreInitialPermissionsPresent() {
    if (!this.isInitialPermissionsPresentSet() && this.getConfig().isOnlyRunOnChange()) {
      throw new Error('Must set initial state using setInitialState() when config.isOnlyRunOnChange() is true.');
    }
  }

  getReturnValue(options) {
    if (!this.getConfig().hasOptionReturnValueKey()) {
      return this.getConfig().getDefaultReturnValue();
    }

    return _.get(
      options,
      [this.getConfig().getOptionReturnValueKey()],
      this.getConfig().getDefaultReturnValue(),
    );
  }
}

module.exports = PermissionEnforcer;

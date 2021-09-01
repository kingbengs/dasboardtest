'use strict';

const _ = require('lodash');
const Bluebird = require('bluebird');

const {
  Assertion,
  errors: {
    InvalidInput,
  },
  constants: {
    Permissions,
  },
} = require('@funnelytics/utilities');
const {
  models: {
    dashboard: modelsDashboard,
  },
  permissions: {
    PermissionManager,
    PermissionWrapper,
    PermissionScope,
    FetchPermissionOptions,
    AccessLevelInput,
  },
} = require('@funnelytics/shared-data');

const ConflictResponse = require('./permission-conflict/ConflictResponse');
const SlackIntegration = require('../integrations/SlackIntegration');

/**
 * This class will be used to manage any conflicts in permissions allotted to a user.
 *
 * For example, users with both the Permissions.META_SESSIONS_FIXED and Permissions.META_SESSIONS_TIERED permissions
 * can be detected and we can notify ourselves that someone has two permissions that, for now, would have to be specially
 * managed on an individual level until we further develop these systems in our applications. As it stands, the time investment
 * to do these notifications is significantly less than that required to handle such cases automatically.
 *
 * Example usage:
 *
 * const conflict = new PermissionConflict({
 *   userId,
 *   permissionsInConflict: [
 *     [ Permissions.META_SESSIONS_FIXED ],
 *     [ Permissions.META_SESSIONS_TIERED, Permissions.META_SESSIONS_UNLIMITED ]
 *   ],
 * });
 *
 * const conflictResponse = await conflict.detect({
 *  transacting,
 * });
 *
 * if (conflictResponse.isInConflict()) {
 *   console.log(`${conflictResponse.getUserString()} has conflicting permissions`);
 * }
 */

class PermissionConflict {
  constructor({
    userId,
    permissionsInConflict,
  }) {
    this.setUserId(userId);
    this.setPermissions(permissionsInConflict);
  }

  /**
   * Get current conflict state based on the permissions passed. Quick use method that doesn't require extra boilerplate
   * for the user of this method.
   *
   * @returns {Boolean} is there a conflict currently?
   */
  static isInConflictAsync({
    userId,
    permissions,
    transacting,
  } = {}) {
    return Bluebird.try(async () => {
      Assertion.transacting(transacting);

      const conflict = new PermissionConflict({
        userId,
        permissionsInConflict: permissions,
      });

      const response = await conflict.detect({
        transacting,
      });

      return response.isInConflict();
    });
  }

  /**
   * Compare a passed conflict check value with the current common conflict check and send off a slack notification
   * if the conflict status has changed
   *
   * @returns {Promise} that resolves to undefined
   */
  static announceConflictChange({
    userId,
    permissions,
    previousState,
    transacting,
  } = {}) {
    return Bluebird.try(async () => {
      Assertion.transacting(transacting);
      Assertion.boolean(previousState);

      const conflict = new PermissionConflict({
        userId,
        permissionsInConflict: permissions,
      });

      const currentConflictResponse = await conflict.detect({
        transacting,
      });

      const customerIdentification = currentConflictResponse.getUserString();
      if (!previousState && currentConflictResponse.isInConflict()) {
        SlackIntegration.notifyHasConflictingPermissions({
          customerIdentification,
        });
      } else if (previousState && !currentConflictResponse.isInConflict()) {
        SlackIntegration.notifyNoConflictingPermissions({
          customerIdentification,
        });
      }
      // No accouncement required as the status hasn't changed.
    });
  }

  setUserId(userId) {
    Assertion.uuid(userId);

    this._userId = userId;
  }

  getUserId() {
    return this._userId;
  }

  /**
   * These permissions should be an array of arrays of permission string names.
   * Each array should be considered "in conflict" with other arrays passed.
   *
   * Ex.
   * [
   *   [ Permissions.META_SESSIONS_FIXED ], // permission set 1
   *   [ Permissions.META_SESSIONS_TIERED, Permissions.META_SESSIONS_UNLIMITED ] // permission set 2
   * ]
   *
   * Where if the user has a permission from set 1 and also a permission from set 2, a conflict will be detected.
   */
  setPermissions(permissions) {
    Assertion.array(permissions);
    permissions.forEach(permissionGroup => {
      Assertion.arrayOfStrings(permissionGroup, { allowEmptyArray: false });
      permissionGroup.forEach(permission => {
        Assertion.validString(permission, Permissions.ALL_PERMISSIONS);
      });
    });
    if (permissions.length < 2) {
      throw new InvalidInput('permissions must be an array of at least two arrays of permission name strings. Got ', permissions);
    }

    this._permissions = permissions;
  }

  getPermissions() {
    return this._permissions;
  }

  getUniquePermissions() {
    return _.uniq(
      _.flatten(this.getPermissions()),
    );
  }

  /**
   * @returns ConflictResponse
   */
  detect({
    transacting,
  } = {}) {
    return Bluebird.try(async () => {
      Assertion.transacting(transacting);

      const user = await modelsDashboard.User.forge().where({
        id: this.getUserId(),
      }).fetch({
        columns: [
          'id',
          'email',
        ],
        transacting,
      });

      if (!user) {
        return ConflictResponse.createEmpty();
      }

      // Check if the user owns two conflicting types of products:
      const permissionManager = new PermissionManager(user.get('id'));
      const options = this.getUniquePermissions().reduce((permissionsHash, permissionName) => {
        const permissionOptions = new FetchPermissionOptions({
          transacting,
          permission: new PermissionWrapper(permissionName),
          scope: new PermissionScope({
            type: PermissionScope.TYPE_USER,
            instance: user.get('id'),
          }),
          accessLevel: new AccessLevelInput({ accessLevel: AccessLevelInput.ADMIN }),
        });
        _.set(permissionsHash, [permissionName], permissionOptions);

        return permissionsHash;
      }, {});

      const results = await Bluebird.props(_.reduce(options, (promises, permissionOptions, permissionName) => {
        _.set(promises, [permissionName], permissionManager.fetchPermissionResponse(permissionOptions));
        return promises;
      }, {}));

      /**
       * reduce each array in this.getPermissions() into either true or false depending on whether the given
       * permission exists on the user.
       */
      const groupResults = this.getPermissions().map(permissionGroup => {
        return permissionGroup.reduce((hasPermissionFromGroup, permissionName) => {
          if (hasPermissionFromGroup) {
            return true;
          }
          return _.get(results, [permissionName]).getHasPermission();
        }, false);
      });

      /**
       * If there is more than one true in the array from the reducution above, a conflict is detected as
       * defined by the PermissionConflict constructor.
       */
      const conflictingGroupCount = groupResults.reduce((totalCount, hasPermissionFromGroup) => {
        if (hasPermissionFromGroup) {
          return totalCount + 1;
        }

        return totalCount;
      }, 0);

      const isInConflict = conflictingGroupCount > 1;

      return new ConflictResponse({
        isInConflict,
        userString: `User ${user.get('id')} with email address ${user.get('email')}`,
      });
    });
  }
}

module.exports = PermissionConflict;

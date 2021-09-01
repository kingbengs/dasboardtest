'use strict';

const {
  ConstantsProxy,
  constants: {
    Permissions,
  },
} = require('@funnelytics/utilities');

const PermissionConflictConstants = ConstantsProxy.create({
  /**
   * The most common conflict check seeing whether someone has both unlimited/tiered sessions permissions through
   * some sort of measure package and also the fixed sessions permissions through one of the sessions products.
   */
  PERMISSIONS_SESSIONS: [
    [Permissions.META_SESSIONS_FIXED],
    [Permissions.META_SESSIONS_TIERED, Permissions.META_SESSIONS_UNLIMITED],
  ],
});

module.exports = PermissionConflictConstants;

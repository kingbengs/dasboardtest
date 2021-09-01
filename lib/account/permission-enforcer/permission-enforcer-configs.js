'use strict';

const _ = require('lodash');
const Bluebird = require('bluebird');
const {
  constants: {
    Permissions,
  },
  Assertion,
} = require('@funnelytics/utilities');
const {
  databases: {
    dashboard: BookshelfDashboard,
  },
} = require('@funnelytics/shared-data');
const PermissionEnforcerConfig = require('./PermissionEnforcerConfig');
const AccountConstants = require('../AccountConstants');

// TODO: remove after delete workspaces subscription from Recurly
const WorkspacesSubsciptionPurchasePreventer = new PermissionEnforcerConfig({
  requiredPermissions: [
    Permissions.META_WORKSPACES_SUBSCRIPTION,
  ],
  isRunOnPresent: true,
  isOnlyRunOnChange: false,
  optionReturnValueKey: AccountConstants.SUBSCRIPTION_SKUS_TO_PURCHASE,
  handlerPromise: options => {
    return Bluebird.try(async () => {
      const {
        transacting,
        [AccountConstants.SUBSCRIPTION_SKUS_TO_PURCHASE]: skusToPurchase,
      } = options;
      Assertion.transacting(transacting);
      Assertion.arrayOfStrings(skusToPurchase);

      const SKU_COLUMN = 'sku';
      const conflictingSKUs = await BookshelfDashboard.knex.raw(
        `
SELECT ${SKU_COLUMN} FROM recurly_subscription_skus rss
INNER JOIN recurly_subscription_permissions rsp ON rsp.subscription = rss.subscription
INNER JOIN permissions p ON p.id = rsp.permission
WHERE p.name = '${Permissions.META_WORKSPACES_SUBSCRIPTION}';
        `,
      ).transacting(transacting).then(result => {
        return _.get(result, ['rows'], []).map(row => {
          return _.get(row, [SKU_COLUMN]);
        });
      });

      // Exclude conflicting SKUs to prevent duplicate purchase;
      return _.without(skusToPurchase, ...conflictingSKUs);
    });
  },
});

module.exports = {
  WorkspacesSubsciptionPurchasePreventer,
};

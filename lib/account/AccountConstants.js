'use strict';

const {
  ConstantsProxy,
} = require('@funnelytics/utilities');

const AccountConstants = ConstantsProxy.create({
  SUBSCRIPTION_SKUS_TO_PURCHASE: 'subscriptionSKUsToPurchase',
});

module.exports = AccountConstants;

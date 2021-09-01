'use strict';

const {
  ConstantsProxy,
} = require('@funnelytics/utilities');

const SubscriptionConstants = ConstantsProxy.create({
  STATUS_ACTIVE: 'active',
  STATUS_CANCELLING: 'cancelling',
  STATUS_INACTIVE: 'inactive',
});

module.exports = SubscriptionConstants;

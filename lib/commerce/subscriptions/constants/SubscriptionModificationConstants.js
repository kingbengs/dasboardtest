'use strict';

const {
  ConstantsProxy,
} = require('@funnelytics/utilities');

const SubscriptionModificationConstants = ConstantsProxy.create({
  ENABLED: 'Enabled',
  PENDING_CANCELLATION: 'Pending Cancellation',
  TERMINATED: 'Terminated',
});

module.exports = SubscriptionModificationConstants;

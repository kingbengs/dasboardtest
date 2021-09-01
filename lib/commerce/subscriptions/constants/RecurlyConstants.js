'use strict';

const {
  ConstantsProxy,
} = require('@funnelytics/utilities');

const RecurlyConstants = ConstantsProxy.create({
  SUBSCRIPTION_STATE_ACTIVE: 'active',
  SUBSCRIPTION_STATE_CANCELED: 'canceled',
  AFFILIATE_FIELD_NAME: 'tapfiliate_id',
  // 2021-04-13T19:11:49.000Z
  DATE_FORMAT: 'YYYY-MM-DDTHH:mm:ss.SSS[Z]',
});

module.exports = RecurlyConstants;

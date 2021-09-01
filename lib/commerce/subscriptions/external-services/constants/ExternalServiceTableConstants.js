'use strict';

const {
  ConstantsProxy,
} = require('@funnelytics/utilities');

const ExternalServiceTableConstants = ConstantsProxy.create({
  MODEL_PRODUCTS: 'Product',
  MODEL_SUBSCRIPTIONS: 'RecurlySubscription',
  MODEL_USER_PRODUCTS: 'UserProduct',
  MODEL_USER_SUBSCRIPTIONS: 'RecurlyUserSubscription',
  SERVICE_IDENTIFIER_COLUMN: 'id',
  EXTERNAL_STATUS_COLUMN: 'external_status',
  EXTERNAL_ACTION_REQUIRED_COLUMN: 'external_action_required',
});

module.exports = ExternalServiceTableConstants;

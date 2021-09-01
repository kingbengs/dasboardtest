'use strict';

const {
  ConstantsProxy,
} = require('@funnelytics/utilities');

const HandledWebhookConstants = ConstantsProxy.create({
  PAID_INVOICE: 'paid_charge_invoice_notification',
  NEW_SUBSCRIPTION: 'new_subscription_notification',
  CANCELED_SUBSCRIPTION: 'canceled_subscription_notification',
  RENEWED_SUBSCRIPTION: 'renewed_subscription_notification',
  REACTIVATED_SUBSCRIPTION: 'reactivated_account_notification',
  EXPIRED_SUBSCRIPTION: 'expired_subscription_notification',
  UPDATED_SUBSCRIPTION: 'updated_subscription_notification',
});

module.exports = HandledWebhookConstants;

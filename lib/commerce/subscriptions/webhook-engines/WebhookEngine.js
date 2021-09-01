'use strict';

const Promise = require('bluebird');
const _ = require('lodash');
const {
  Assertion,
} = require('@funnelytics/utilities');

const ImplementationRequired = require('../errors/ImplementationRequired');
const SKUManager = require('../sku/SKUManager');
const Invoice = require('../objects/Invoice');
const Subscription = require('../objects/Subscription');
const LineItem = require('../objects/LineItem');
const Webhook = require('../objects/Webhook');
const InvoicedUserLineItem = require('../objects/InvoicedUserLineItem');
const LineItemTypeConstants = require('../constants/LineItemTypeConstants');
const ExternalServiceTableConstants = require('../external-services/constants/ExternalServiceTableConstants');

class WebhookEngine {
  constructor(webhook) {
    this.setWebhook(webhook);
  }

  getInvoiceAsync() {
    return Promise.try(() => {
      if (this.hasInvoice()) {
        return this.getInvoice();
      }

      return this.fetchInvoice().then(invoice => {
        this.setInvoice(invoice);

        return this.getInvoice();
      });
    });
  }

  getSubscriptionAsync() {
    return Promise.try(() => {
      if (this.hasSubscription()) {
        return this.getSubscription();
      }

      return this.fetchSubscription().then(subscription => {
        this.setSubscription(subscription);

        return this.getSubscription();
      });
    });
  }

  getSubscriptionRecordAsync({
    subscriptionId,
    transacting,
  }) {
    return Promise.try(() => {
      Assertion.uuid(subscriptionId);
      Assertion.transacting(transacting);

      const options = {
        subscriptionId,
        transacting,
        columns: [
          'id',
          'name',
          ExternalServiceTableConstants.EXTERNAL_ACTION_REQUIRED_COLUMN,
        ],
      };

      return this.fetchSubscriptionRecordAsync(options);
    });
  }

  getUserSubscriptionRecordAsync({
    externalId,
    transacting,
  }) {
    return Promise.try(() => {
      Assertion.string(externalId);
      Assertion.transacting(transacting);

      const options = {
        externalId,
        transacting,
        columns: [
          'id',
          'status',
          'subscription',
        ],
        withRelated: [{
          subscription(qb) {
            qb.column('id', 'name');
          },
        }],
      };

      return this.fetchUserSubscriptionRecordAsync(options);
    });
  }

  storeInvoice(transacting) {
    return Promise.try(async () => {
      Assertion.transacting(transacting);
      const invoice = await this.getInvoiceAsync();

      const options = {
        invoice,
        transacting,
      };

      return this.saveInvoice(options).then(storedInvoice => {
        Assertion.uuid(storedInvoice.get('id'));

        return storedInvoice.get('id');
      });
    });
  }

  storeUserSubscription({
    subscription,
    transacting,
  }) {
    return Promise.try(async () => {
      Assertion.instanceOf(subscription, Subscription);
      Assertion.transacting(transacting);
      const options = {
        subscription,
        transacting,
        returning: [
          'id',
          'user',
          'subscription',
          'status',
          ExternalServiceTableConstants.EXTERNAL_STATUS_COLUMN,
        ],
      };

      return this.saveUserSubscription(options);
    });
  }

  storeUpdatedUserSubscription({
    subscription,
    transacting,
  }) {
    return Promise.try(async () => {
      Assertion.instanceOf(subscription, Subscription);
      Assertion.transacting(transacting);
      const options = {
        subscription,
        transacting,
        returning: [
          'id',
          'user',
          'subscription',
          'status',
          ExternalServiceTableConstants.EXTERNAL_STATUS_COLUMN,
        ],
      };

      return this.updateUserSubscription(options);
    });
  }

  storeLineItem({
    invoiceId,
    lineItem,
    skuManager,
    transacting,
    type,
  }) {
    return Promise.try(() => {
      Assertion.uuid(invoiceId);
      Assertion.instanceOf(lineItem, LineItem);
      Assertion.instanceOf(skuManager, SKUManager);
      Assertion.transacting(transacting);
      Assertion.validString(type, _.values(LineItemTypeConstants));

      const options = {
        invoiceId,
        lineItem,
        skuManager,
        transacting,
        type,
      };

      return this.saveLineItem(options);
    });
  }

  getInvoiceItemIdsForLineItems({
    invoicedUserLineItems,
    transacting,
  }) {
    return Promise.try(() => {
      Assertion.arrayOfInstancesOf(invoicedUserLineItems, InvoicedUserLineItem);
      Assertion.transacting(transacting);

      const options = {
        invoicedUserLineItems,
        transacting,
      };

      return this.fetchInvoiceItemIdsForLineItems(options);
    });
  }

  getWebhookType() {
    return this.getWebhook().getType();
  }

  fetchInvoice() {
    throw new ImplementationRequired('Must implement the "fetchInvoice" method');
  }

  fetchSubscription() {
    throw new ImplementationRequired('Must implement the "fetchSubscription" method');
  }

  fetchSubscriptionRecordAsync() {
    throw new ImplementationRequired('Must implement the "fetchSubscriptionRecordAsync" method');
  }

  fetchUserSubscriptionRecordAsync() {
    throw new ImplementationRequired('Must implement the "fetchUserSubscriptionRecordAsync" method');
  }

  saveInvoice() {
    throw new ImplementationRequired('Must implement the "saveInvoice" method');
  }

  saveLineItem() {
    throw new ImplementationRequired('Must implement the "saveLineItem" method');
  }

  saveUserSubscription() {
    throw new ImplementationRequired('Must implement the "saveUserSubscription" method');
  }

  updateUserSubscription() {
    throw new ImplementationRequired('Must implement the "updateUserSubscription" method');
  }

  fetchInvoiceItemIdsForLineItems() {
    throw new ImplementationRequired('Must implement the "fetchInvoiceItemIdsForLineItems" method');
  }

  getWebhook() {
    return this._webhook;
  }

  getInvoice() {
    return this._invoice;
  }

  getSubscription() {
    return this._subscription;
  }

  hasInvoice() {
    return this.getInvoice() instanceof Invoice;
  }

  hasSubscription() {
    return this.getSubscription() instanceof Subscription;
  }

  getUserId() {
    return this._accountId;
  }

  hasUserId() {
    return !_.isEmpty(this.getUserId());
  }

  setWebhook(webhook) {
    Assertion.instanceOf(webhook, Webhook);

    this._webhook = webhook;
  }

  setInvoice(invoice) {
    Assertion.instanceOf(invoice, Invoice);

    this._invoice = invoice;
  }

  setSubscription(subscription) {
    Assertion.notEmpty(subscription, Subscription);

    this._subscription = subscription;
  }

  setAccountId(accountId) {
    Assertion.uuid(accountId);

    this._accountId = accountId;
  }
}

module.exports = WebhookEngine;

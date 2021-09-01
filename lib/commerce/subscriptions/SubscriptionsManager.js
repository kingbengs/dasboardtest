'use strict';

const Promise = require('bluebird');
const {
  Assertion,
} = require('@funnelytics/utilities');

const ManagerEngine = require('./manager-engines/ManagerEngine');

class SubscriptionsManager {
  constructor(engine) {
    this.setEngine(engine);
  }

  getSubscriptionsFromDb(options) {
    return Promise.try(async () => {
      return this.getEngine().getSubscriptionsFromDb(options);
    });
  }

  getSubscriptionsAsync() {
    return Promise.try(() => {
      return this.getEngine().getSubscriptionsAsync();
    });
  }

  getInvoicesAsync() {
    return Promise.try(() => {
      return this.getEngine().getInvoicesAsync();
    });
  }

  getPaymentMethodAsync() {
    return Promise.try(() => {
      return this.getEngine().getPaymentMethodAsync();
    });
  }

  updateAccountAsync(options) {
    return Promise.try(() => {
      return this.getEngine().updateAccountAsync(options);
    });
  }

  setPaymentMethodAsync(token, fingerprint) {
    return Promise.try(() => {
      return this.getEngine().setPaymentMethodAsync(token, fingerprint);
    });
  }

  unsetPaymentMethodAsync() {
    return Promise.try(() => {
      return this.getEngine().unsetPaymentMethodAsync();
    });
  }

  cancelSubscriptionAsync(subscriptionId) {
    return Promise.try(() => {
      return this.getEngine().cancelSubscriptionAsync(subscriptionId);
    });
  }

  terminateSubscriptionAsync(subscriptionId) {
    return Promise.try(() => {
      return this.getEngine().terminateSubscriptionAsync(subscriptionId);
    });
  }

  updateAppDataFromInvoicesAsync(invoices) {
    return Promise.try(() => {
      return this.getEngine().updateAppDataFromInvoicesAsync(invoices);
    });
  }

  updateAppDataFromSubscriptionsAsync(invoices) {
    return Promise.try(() => {
      return this.getEngine().updateAppDataFromSubscriptionsAsync(invoices);
    });
  }

  purchaseSubscriptions(options) {
    return Promise.try(() => {
      return this.getEngine().purchaseSubscriptions(options);
    });
  }

  getNormalizedItems(items) {
    return this.getEngine().getNormalizedItems(items);
  }

  getEngine() {
    return this._engine;
  }

  setEngine(engine) {
    Assertion.instanceOf(engine, ManagerEngine);

    this._engine = engine;
  }

  getInvoicePdf(invoiceId) {
    return Promise.try(() => {
      return this.getEngine().getInvoicePdf(invoiceId);
    });
  }
}

module.exports = SubscriptionsManager;

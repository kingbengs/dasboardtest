'use strict';

const Promise = require('bluebird');
const {
  Assertion,
} = require('@funnelytics/utilities');

const ImplementationRequired = require('../errors/ImplementationRequired');

class ManagerEngine {
  constructor(userId) {
    this.setUserId(userId);
  }

  getInvoicesAsync() {
    return Promise.try(() => {
      return this.fetchInvoices();
    });
  }

  getPaymentMethodAsync() {
    return Promise.try(() => {
      return this.fetchPaymentMethod();
    });
  }

  setPaymentMethodAsync(token, fingerprint) {
    return Promise.try(() => {
      return this.fetchSetPaymentMethod(token, fingerprint);
    });
  }

  updateAccountAsync(options) {
    return Promise.try(() => {
      return this.fetchUpdateAccount(options);
    });
  }

  unsetPaymentMethodAsync() {
    return Promise.try(() => {
      return this.fetchUnsetPaymentMethod();
    });
  }

  getSubscriptionsAsync() {
    return Promise.try(() => {
      return this.fetchSubscriptions();
    });
  }

  getSubscriptionsFromDb(options) {
    return Promise.try(() => {
      return this.fetchSubscriptionsFromDb(options);
    });
  }

  cancelSubscriptionAsync(subscriptionId) {
    return Promise.try(() => {
      return this.fetchCancelSubscription(subscriptionId);
    });
  }

  terminateSubscriptionAsync(subscriptionId) {
    return Promise.try(() => {
      return this.fetchTerminateSubscriptionAsync(subscriptionId);
    });
  }

  updateAppDataFromInvoicesAsync(invoices) {
    return Promise.try(() => {
      return this.fetchUpdateAppDataFromInvoices(invoices);
    });
  }

  updateAppDataFromSubscriptionsAsync(invoices) {
    return Promise.try(() => {
      return this.fetchUpdateAppDataFromSubscriptions(invoices);
    });
  }

  purchaseSubscriptions(options) {
    return Promise.try(() => {
      return this.fetchPurchaseSubscriptions(options);
    });
  }

  getInvoicePdf(invoiceId) {
    return Promise.try(() => {
      return this.fetchInvoicePdf(invoiceId);
    });
  }

  /**
   * Return items as an array of items even when only 1 is passed
   */
  getNormalizedItems(items) {
    // Implement in specific handler as required.
    return items;
  }

  fetchInvoices() {
    throw new ImplementationRequired('Must implement the "fetchInvoices" method');
  }

  fetchPaymentMethod() {
    throw new ImplementationRequired('Must implement the "fetchPaymentMethod" method');
  }

  fetchSetPaymentMethod() {
    throw new ImplementationRequired('Must implement the "fetchSetPaymentMethod" method');
  }

  fetchUpdateAccount() {
    throw new ImplementationRequired('Must implement the "fetchUpdateAccount" method');
  }

  fetchUnsetPaymentMethod() {
    throw new ImplementationRequired('Must implement the "fetchUnsetPaymentMethod" method');
  }

  fetchSubscriptions() {
    throw new ImplementationRequired('Must implement the "fetchSubscriptions" method');
  }

  fetchSubscriptionsFromDb() {
    throw new ImplementationRequired('Must implement the "fetchSubscriptionsFromDb" method');
  }

  fetchCancelSubscription() {
    throw new ImplementationRequired('Must implement the "fetchCancelSubscription" method');
  }

  fetchTerminateSubscriptionAsync() {
    throw new ImplementationRequired('Must implement the "fetchTerminateSubscriptionAsync" method');
  }

  fetchUpdateAppDataFromInvoices() {
    throw new ImplementationRequired('Must implement the "fetchUpdateAppDataFromInvoices" method');
  }

  fetchUpdateAppDataFromSubscriptions() {
    throw new ImplementationRequired('Must implement the "fetchUpdateAppDataFromSubscriptions" method');
  }

  fetchPurchaseSubscriptions() {
    throw new ImplementationRequired('Must implement the "fetchPurchaseSubscriptions" method');
  }

  fetchInvoicePdf() {
    throw new ImplementationRequired('Must implement the "fetchInvoicePdf" method');
  }

  getUserId() {
    return this._userId;
  }

  setUserId(userId) {
    Assertion.uuid(userId);

    this._userId = userId;
  }
}

module.exports = ManagerEngine;

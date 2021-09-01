const _ = require('lodash');
// const Promise = require('bluebird');
// const DripIntegration = require('../integrations/Drip');

module.exports = class SubscriptionResponse {
  constructor({ email, message }) {
    // Return values to inform consumer about the effect done by Updater.
    this.enabledProducts = [];
    this.cancelledProducts = [];
    this.email = email;
    this.messages = [];
    if (message) {
      this.addMessage(message);
    }
  }

  removeEnabledProduct(enabledProductToRemove) {
    this.enabledProducts = _.without(this.getEnabledProducts(), enabledProductToRemove);
  }

  removeCancelledProduct(cancelledProductToRemove) {
    this.cancelledProducts = _.without(this.getCancelledProducts(), cancelledProductToRemove);
  }

  addEnabledProduct(newEnabledProduct) {
    // if a product is both cancelled and enabled, no change happens.
    if (this.getCancelledProducts().includes(newEnabledProduct)) {
      this.removeCancelledProduct(newEnabledProduct);
      return;
    }

    this.enabledProducts = _.concat(this.enabledProducts, newEnabledProduct);
  }

  addCancelledProduct(newCancelledProduct) {
    // if a product is both cancelled and enabled, no change happens.
    if (this.getEnabledProducts().includes(newCancelledProduct)) {
      this.removeEnabledProduct(newCancelledProduct);
      return;
    }

    this.cancelledProducts = _.concat(this.cancelledProducts, newCancelledProduct);
  }

  getEnabledProducts() {
    return this.enabledProducts;
  }

  getCancelledProducts() {
    return this.cancelledProducts;
  }

  getEmail() {
    return this.email;
  }

  addMessage(newMessage) {
    this.messages = [...this.messages, newMessage];
  }

  getMessages() {
    const messages = this.messages.length === 0 ? ['No actions taken.'] : this.messages;

    return messages;
  }

  subscriptionsModified() {
    return this.messages.length > 0;
  }

  addSubscriptionMessage({
    verb, id, productName, status,
  }) {
    return this.addMessage(`${verb} subscription with id '${id}' and product name: '${productName}' and status '${status}'`);
  }

  // sendAllDripEvents() {
  //   return Promise.all(_.concat(
  //     this.getEnabledProducts().map(enabledProductName => { return DripIntegration.createEvent(this.getEmail(), `Enable ${enabledProductName} Subscription`); }),
  //     this.getCancelledProducts().map(cancelledProductName => { return DripIntegration.createEvent(this.getEmail(), `Cancel ${cancelledProductName} Subscription`); }),
  //   ));
  // }
};

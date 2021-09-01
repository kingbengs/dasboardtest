'use strict';

const {
  Assertion,
} = require('@funnelytics/utilities');

const SubscriptionModificationConstants = require('../constants/SubscriptionModificationConstants');

class SubscriptionUpdatedResponse {
  constructor({
    userSubscription,
    modification = null,
    name,
  }) {
    this.setModification(modification);
    this.setUserSubscription(userSubscription);
    this.setName(name);
  }

  getUserSubscription() {
    return this._userSubscription;
  }

  hasModification() {
    return this.getModification() !== null;
  }

  getModification() {
    return this._modification;
  }

  getName() {
    return this._name;
  }

  setUserSubscription(userSubscription) {
    this._userSubscription = userSubscription;
  }

  setModification(modification) {
    if (modification === null) {
      this._modification = null;
      return;
    }

    Assertion.validString(modification, SubscriptionUpdatedResponse.getValidModifications());

    this._modification = modification;
  }

  setName(name) {
    Assertion.string(name);

    this._name = name;
  }

  static getValidModifications() {
    return [
      SubscriptionModificationConstants.ENABLED,
      SubscriptionModificationConstants.PENDING_CANCELLATION,
      SubscriptionModificationConstants.TERMINATED,
    ];
  }
}

module.exports = SubscriptionUpdatedResponse;

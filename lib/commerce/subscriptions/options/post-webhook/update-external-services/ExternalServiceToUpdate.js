'use strict';

const {
  Assertion,
} = require('@funnelytics/utilities');

class ExternalServiceToUpdate {
  constructor({
    serviceId,
    recordId,
    userId,
    activating = true,
  }) {
    this.setServiceId(serviceId);
    this.setRecordId(recordId);
    this.setUserId(userId);
    this.setActivating(activating);
  }

  getServiceId() {
    return this._serviceId;
  }

  getRecordId() {
    return this._recordId;
  }

  getUserId() {
    return this._userId;
  }

  isActivating() {
    return this._activating;
  }

  /**
   * ID of the product or subscription as it appears in our database.
   */
  setServiceId(serviceId) {
    Assertion.uuid(serviceId);

    this._serviceId = serviceId;
  }

  /**
   * ID in our database of the product or subscriptin instance associated with the given user.
   */
  setRecordId(recordId) {
    Assertion.uuid(recordId);

    this._recordId = recordId;
  }

  /**
   * ID in our database of the user.
   */
  setUserId(userId) {
    Assertion.uuid(userId);

    this._userId = userId;
  }

  /**
   * True if the external service is to be activated for the given user and false if the service is to be terminated.
   */
  setActivating(activating) {
    Assertion.boolean(activating);

    this._activating = activating;
  }
}

module.exports = ExternalServiceToUpdate;

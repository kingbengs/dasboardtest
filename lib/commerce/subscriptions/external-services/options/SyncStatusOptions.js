'use strict';

const {
  Assertion,
} = require('@funnelytics/utilities');

const ExternalServiceStatusConstants = require('../constants/ExternalServiceStatusConstants');

class SyncStatusOptions {
  constructor({
    recordId,
    transacting,
    status,
  }) {
    this.setRecordId(recordId);
    this.setTransacting(transacting);
    this.setStatus(status);
  }

  getRecordId() {
    return this._recordId;
  }

  getTransacting() {
    return this._transacting;
  }

  getStatus() {
    return this._status;
  }

  setRecordId(recordId) {
    Assertion.uuid(recordId);

    this._recordId = recordId;
  }

  setTransacting(transacting) {
    Assertion.transacting(transacting);

    this._transacting = transacting;
  }

  setStatus(status) {
    Assertion.validString(status, [
      ExternalServiceStatusConstants.ACTIVATED,
      ExternalServiceStatusConstants.ACTIVATION_FAILED,
      ExternalServiceStatusConstants.TERMINATED,
      ExternalServiceStatusConstants.TERMINATION_FAILED,
    ]);

    this._status = status;
  }
}

module.exports = SyncStatusOptions;

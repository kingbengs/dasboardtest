'use strict';

const {
  Assertion,
} = require('@funnelytics/utilities');

const ExternalServiceTypeConstants = require('../../external-services/constants/ExternalServiceTypeConstants');
const ExternalServiceToUpdate = require('./update-external-services/ExternalServiceToUpdate');

class UpdateExternalServicesOptions {
  constructor({
    externalServiceType,
    externalServicesToUpdate,
  }) {
    this.setExternalServiceType(externalServiceType);
    this.setExternalServicesToUpdate(externalServicesToUpdate);
  }

  getExternalServiceType() {
    return this._externalServiceType;
  }

  getExternalServicesToUpdate() {
    return this._externalServicesToUpdate;
  }

  setExternalServiceType(externalServiceType) {
    Assertion.validString(externalServiceType, [
      ExternalServiceTypeConstants.SUBSCRIPTIONS,
      ExternalServiceTypeConstants.PRODUCTS,
    ]);

    this._externalServiceType = externalServiceType;
  }

  setExternalServicesToUpdate(externalServicesToUpdate) {
    Assertion.arrayOfInstancesOf(externalServicesToUpdate, ExternalServiceToUpdate);

    this._externalServicesToUpdate = externalServicesToUpdate;
  }
}

module.exports = UpdateExternalServicesOptions;

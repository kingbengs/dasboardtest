'use strict';

const _ = require('lodash');

const {
  Assertion,
} = require('@funnelytics/utilities');

const ExternalServiceMapping = require('./attributes/ExternalServiceMapping');
const externalServiceConfigs = require('./configs/external-service-configs');
const InvalidConfiguration = require('../../errors/InvalidConfiguration');
const ExternalServiceTableConstants = require('../constants/ExternalServiceTableConstants');

class ExternalServiceConfig {
  constructor({
    bookshelfServiceName,
    bookshelfRelationshipName,
    idColumn = ExternalServiceTableConstants.SERVICE_IDENTIFIER_COLUMN,
    externalActionRequiredColumn = ExternalServiceTableConstants.EXTERNAL_ACTION_REQUIRED_COLUMN,
    externalStatusColumn = ExternalServiceTableConstants.EXTERNAL_STATUS_COLUMN,
    externalServiceMappings,
  }) {
    this.setBookshelfServiceName(bookshelfServiceName);
    this.setBookshelfRelationshipName(bookshelfRelationshipName);
    this.setIdColumn(idColumn);
    this.setExternalActionRequiredColumn(externalActionRequiredColumn);
    this.setExternalStatusColumn(externalStatusColumn);
    this.setExternalServiceMappings(externalServiceMappings);
  }

  static createFromType(type) {
    Assertion.string(type);

    const createFunction = _.get(externalServiceConfigs, type);

    if (!_.isFunction(createFunction)) {
      throw new InvalidConfiguration(`ExternalServiceConfig "${type}" is not configured for creation.`);
    }

    const config = createFunction(ExternalServiceConfig);

    Assertion.instanceOf(config, ExternalServiceConfig);

    return config;
  }

  getBookshelfServiceName() {
    return this._bookshelfServiceName;
  }

  getBookshelfRelationshipName() {
    return this._bookshelfRelationshipName;
  }

  getIdColumn() {
    return this._idColumn;
  }

  getExternalActionRequiredColumn() {
    return this._externalActionRequiredColumn;
  }

  getExternalStatusColumn() {
    return this._externalStatusColumn;
  }

  getActivateMethodById(id) {
    const service = this.getServiceById(id);

    if (!service) {
      return false;
    }

    return service.getActivationMethod();
  }

  getTerminateMethodById(id) {
    const service = this.getServiceById(id);

    if (!service) {
      return false;
    }

    return service.getTerminationMethod();
  }

  getServiceById(id) {
    Assertion.uuid(id);

    return this.getExternalServiceMappings().find(externalServiceMapping => {
      return externalServiceMapping.getId() === id;
    });
  }

  getExternalServiceMappings() {
    return this._externalServiceMappings;
  }

  /**
   * Name of the Bookshelf model that is stores the product or subscription type.
   */
  setBookshelfServiceName(bookshelfServiceName) {
    Assertion.validString(bookshelfServiceName, [
      ExternalServiceTableConstants.MODEL_PRODUCTS,
      ExternalServiceTableConstants.MODEL_SUBSCRIPTIONS,
    ]);

    this._bookshelfServiceName = bookshelfServiceName;
  }

  /**
   * Name of the Bookshelf model that is stores the instance of the product or subscription associated with a user.
   */
  setBookshelfRelationshipName(bookshelfRelationshipName) {
    Assertion.validString(bookshelfRelationshipName, [
      ExternalServiceTableConstants.MODEL_USER_PRODUCTS,
      ExternalServiceTableConstants.MODEL_USER_SUBSCRIPTIONS,
    ]);

    this._bookshelfRelationshipName = bookshelfRelationshipName;
  }

  setIdColumn(idColumn) {
    Assertion.validString(idColumn, [
      ExternalServiceTableConstants.SERVICE_IDENTIFIER_COLUMN,
    ]);

    this._idColumn = idColumn;
  }

  setExternalActionRequiredColumn(externalActionRequiredColumn) {
    Assertion.validString(externalActionRequiredColumn, [
      ExternalServiceTableConstants.EXTERNAL_ACTION_REQUIRED_COLUMN,
    ]);

    this._externalActionRequiredColumn = externalActionRequiredColumn;
  }

  /**
   * Name of the column in the table specified by _bookshelfRelationshipName attribute that tracks whether the related external
   * service has been activated for this product or subscription.
   */
  setExternalStatusColumn(externalStatusColumn) {
    Assertion.validString(externalStatusColumn, [
      ExternalServiceTableConstants.EXTERNAL_STATUS_COLUMN,
    ]);

    this._externalStatusColumn = externalStatusColumn;
  }

  setExternalServiceMappings(externalServiceMappings) {
    Assertion.arrayOfInstancesOf(externalServiceMappings, ExternalServiceMapping);

    this._externalServiceMappings = externalServiceMappings;
  }
}

module.exports = ExternalServiceConfig;

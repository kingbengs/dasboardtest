'use strict';

const _ = require('lodash');

const {
  Assertion,
} = require('@funnelytics/utilities');

const externalServiceMappings = require('./mappings/external-service-mappings');
const InvalidConfiguration = require('../../../errors/InvalidConfiguration');

class ExternalServiceMapping {
  constructor({
    id,
    activationMethod,
    terminationMethod,
  }) {
    this.setId(id);
    this.setActivationMethod(activationMethod);
    this.setTerminationMethod(terminationMethod);
  }

  static createFromId(id) {
    Assertion.string(id);

    const createFunction = _.get(externalServiceMappings, id);

    if (!_.isFunction(createFunction)) {
      throw new InvalidConfiguration(`ExternalServiceMapping "${id}" is not configured for creation.`);
    }

    const mapping = createFunction(ExternalServiceMapping);

    Assertion.instanceOf(mapping, ExternalServiceMapping);

    return mapping;
  }

  getId() {
    return this._id;
  }

  getActivationMethod() {
    return userId => {
      Assertion.uuid(userId);

      return this._activationMethod(userId);
    };
  }

  getTerminationMethod() {
    return userId => {
      Assertion.uuid(userId);

      return this._terminationMethod(userId);
    };
  }

  setId(id) {
    Assertion.uuid(id);

    this._id = id;
  }

  setActivationMethod(activationMethod) {
    Assertion.function(activationMethod);

    this._activationMethod = activationMethod;
  }

  setTerminationMethod(terminationMethod) {
    Assertion.function(terminationMethod);

    this._terminationMethod = terminationMethod;
  }
}

module.exports = ExternalServiceMapping;

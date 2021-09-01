'use strict';

const ImplementationRequired = require('../errors/ImplementationRequired');

class Webhook {
  constructor(rawData) {
    this.type = null;
    this.setParsedData(rawData);
  }

  setParsedData() {
    throw new ImplementationRequired('Must implement "setParsedData');
  }

  getType() {
    throw new ImplementationRequired('Must implement "getType');
  }

  getParsedData() {
    throw new ImplementationRequired('Must implement "getParsedData');
  }

  getInvoiceId() {
    throw new ImplementationRequired('Must implement "getInvoiceId');
  }

  getSubscriptionId() {
    throw new ImplementationRequired('Must implement "getSubscriptionId');
  }
}

module.exports = Webhook;

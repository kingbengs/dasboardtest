'use strict';

const {
  Assertion,
} = require('@funnelytics/utilities');

const HandledWebhookConstants = require('../../constants/HandledWebhookConstants');
const ImplementationRequired = require('../../errors/ImplementationRequired');

class MockedRecurlyWebhook {
  constructor({
    type,
    invoiceNumber,
    subscriptionUUID,
  }) {
    this.setType(type);
    switch (this.getType()) {
      case HandledWebhookConstants.PAID_INVOICE:
        this.setInvoiceNumber(invoiceNumber);
        break;
      case HandledWebhookConstants.NEW_SUBSCRIPTION:
        this.setSubscriptionUUID(subscriptionUUID);
        break;
      default:
        throw new ImplementationRequired(`"${this.getType()}" has not been configured to be mocked.`);
    }
  }

  toXML() {
    switch (this.getType()) {
      case HandledWebhookConstants.PAID_INVOICE:
        return `

<${this.getType()}>
  <invoice>
      <invoice_number type="integer">${this.getInvoiceNumber()}</invoice_number>
  </invoice>
</${this.getType()}>

`.trim();
      case HandledWebhookConstants.NEW_SUBSCRIPTION:
        return `

<${this.getType()}>
  <subscription>
      <uuid>${this.getSubscriptionUUID()}</uuid>
  </subscription>
</${this.getType()}>

`.trim();
      default:
        throw new ImplementationRequired(`"${this.getType()}" has not been configured to be mocked.`);
    }
  }

  getType() {
    return this._type;
  }

  getInvoiceNumber() {
    return this._invoiceNumber;
  }

  getSubscriptionUUID() {
    return this._subscriptionUUID;
  }

  setType(type) {
    Assertion.validString(type, [
      HandledWebhookConstants.PAID_INVOICE,
      HandledWebhookConstants.NEW_SUBSCRIPTION,
    ]);

    this._type = type;
  }

  setInvoiceNumber(invoiceNumber) {
    Assertion.integer(invoiceNumber);

    this._invoiceNumber = invoiceNumber;
  }

  setSubscriptionUUID(subscriptionUUID) {
    Assertion.string(subscriptionUUID);

    this._subscriptionUUID = subscriptionUUID;
  }
}

module.exports = MockedRecurlyWebhook;

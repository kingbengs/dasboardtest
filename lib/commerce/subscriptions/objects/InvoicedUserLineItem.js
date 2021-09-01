'use strict';

const {
  Assertion,
} = require('@funnelytics/utilities');

class InvoicedUserLineItem {
  constructor({
    userId,
    externalId,
    productId = null,
    invoiceItemId = null,
  }) {
    this.setUserId(userId);
    this.setExternalId(externalId);
    this.setProductId(productId);
    this.setInvoiceItemId(invoiceItemId);
  }

  getUserId() {
    return this._userId;
  }

  getExternalId() {
    return this._externalId;
  }

  getInvoiceItemId() {
    return this._invoiceItemId;
  }

  hasInvoiceItemId() {
    return Boolean(this.getInvoiceItemId());
  }

  getProductId() {
    return this._productId;
  }

  // hasProductId() {
  //   return Boolean(this.getProductId());
  // }

  setUserId(userId) {
    Assertion.uuid(userId);

    this._userId = userId;
  }

  setExternalId(externalId) {
    Assertion.string(externalId);

    this._externalId = externalId;
  }

  setProductId(productId) {
    // if (productId === null) {
    //   this._productId = null;
    //   return;
    // }
    Assertion.uuid(productId);

    this._productId = productId;
  }

  setInvoiceItemId(invoiceItemId) {
    if (invoiceItemId === null) {
      this._invoiceItemId = null;
      return;
    }

    Assertion.uuid(invoiceItemId);

    this._invoiceItemId = invoiceItemId;
  }
}

module.exports = InvoicedUserLineItem;

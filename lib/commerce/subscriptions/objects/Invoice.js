'use strict';

const _ = require('lodash');
const {
  Assertion,
} = require('@funnelytics/utilities');

const LineItem = require('./LineItem');

const EXTERNAL_ID_PREFIX = 'recurly-';

class Invoice {
  constructor({
    userId,
    externalId,
    state,
    chargeTotalInCents,
    creditTotalInCents,
    currency,
    closedAt,
    subscriptions,
    products,
    addOns,
  }) {
    this.setUserId(userId);
    this.setExternalId(externalId);
    this.setState(state);
    this.setChargeTotalInCents(chargeTotalInCents);
    this.setCreditTotalInCents(creditTotalInCents);
    this.setCurrency(currency);
    this.setClosedAt(closedAt);
    this.setSubscriptions(subscriptions);
    this.setProducts(products);
    this.setAddOns(addOns);
  }

  getUserId() {
    return this._userId;
  }

  getExternalId() {
    return this._externalId;
  }

  getPrefixedExternalId() {
    return `${EXTERNAL_ID_PREFIX}${this.getExternalId()}`;
  }

  getState() {
    return this._state;
  }

  getChargeTotalInCents() {
    return this._chargeTotalInCents;
  }

  getCreditTotalInCents() {
    return this._creditTotalInCents;
  }

  getCurrency() {
    return this._currency;
  }

  getClosedAt() {
    return this._closedAt;
  }

  getSubscriptionAdjustments() {
    return this._subscriptions;
  }

  hasSubscriptions() {
    return this.getSubscriptionAdjustments().length > 0;
  }

  getProductAdjustments() {
    return this._products;
  }

  hasProducts() {
    return this.getProductAdjustments().length > 0;
  }

  getAddOnAdjustments() {
    return this._addOns;
  }

  hasAddOnAdjustments() {
    return this.getAddOnAdjustments().length > 0;
  }

  getLineItems() {
    return _.concat(
      this.getSubscriptionAdjustments(),
      this.getProductAdjustments(),
      this.getAddOnAdjustments(),
    );
  }

  setUserId(userId) {
    Assertion.uuid(userId);

    this._userId = userId;
  }

  setExternalId(externalId) {
    Assertion.string(externalId);

    this._externalId = externalId;
  }

  setState(state) {
    Assertion.string(state);

    this._state = state;
  }

  setChargeTotalInCents(chargeTotalInCents) {
    Assertion.integer(chargeTotalInCents);

    this._chargeTotalInCents = chargeTotalInCents;
  }

  setCreditTotalInCents(creditTotalInCents) {
    Assertion.integer(creditTotalInCents);

    this._creditTotalInCents = creditTotalInCents;
  }

  setCurrency(currency) {
    Assertion.string(currency);

    this._currency = currency;
  }

  setClosedAt(closedAt) {
    Assertion.string(closedAt, { allowNull: true });

    this._closedAt = closedAt;
  }

  setSubscriptions(subscriptions) {
    Assertion.arrayOfInstancesOf(subscriptions, LineItem);

    this._subscriptions = subscriptions;
  }

  setProducts(products) {
    Assertion.arrayOfInstancesOf(products, LineItem);

    this._products = products;
  }

  setAddOns(addOns) {
    Assertion.arrayOfInstancesOf(addOns, LineItem);

    this._addOns = addOns;
  }
}

module.exports = Invoice;

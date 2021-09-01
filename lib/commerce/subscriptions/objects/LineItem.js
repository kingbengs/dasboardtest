'use strict';

const {
  Assertion,
} = require('@funnelytics/utilities');
const LineItemConstants = require('../constants/LineItemConstants');

class LineItem {
  constructor({
    externalId,
    subscriptionId = null,
    description,
    SKU,
    totalInCents,
    quantity,
    origin,
  }) {
    this.setExternalId(externalId);
    this.setSubscriptionId(subscriptionId);
    this.setDescription(description);
    this.setSKU(SKU);
    this.setTotalInCents(totalInCents);
    this.setQuantity(quantity);
    this.setOrigin(origin);
  }

  getExternalId() {
    return this._externalId;
  }

  getSubscriptionId() {
    return this._subscriptionId;
  }

  getDescription() {
    return this._description;
  }

  getSKU() {
    return this._SKU;
  }

  getTotalInCents() {
    return this._totalInCents;
  }

  getQuantity() {
    return this._quantity;
  }

  getOrigin() {
    return this._origin;
  }

  isAddOn() {
    return this.getOrigin() === LineItemConstants.ORIGIN_ADD_ON;
  }

  setDescription(description) {
    Assertion.string(description);

    this._description = description;
  }

  setExternalId(externalId) {
    Assertion.string(externalId);

    this._externalId = externalId;
  }

  setSubscriptionId(subscriptionId) {
    Assertion.string(subscriptionId, { allowNull: true });

    this._subscriptionId = subscriptionId;
  }

  setSKU(SKU) {
    Assertion.string(SKU, {
      allowNull: true,
    });

    this._SKU = SKU;
  }

  setTotalInCents(totalInCents) {
    Assertion.integer(totalInCents);

    this._totalInCents = totalInCents;
  }

  setQuantity(quantity) {
    Assertion.integer(quantity);

    this._quantity = quantity;
  }

  setOrigin(origin) {
    Assertion.string(origin, { allowEmpty: false });

    this._origin = origin;
  }
}

module.exports = LineItem;

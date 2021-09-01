'use strict';

const _ = require('lodash');
const {
  Assertion,
} = require('@funnelytics/utilities');

const AddOnTypeConstants = require('../constants/AddOnTypeConstants');

class AddOn {
  constructor({
    type,
    code,
    unitAmountInCents,
    quantity,
    revenueScheduleType = null,
  }) {
    this.setType(type);
    this.setCode(code);
    this.setUnitAmountInCents(unitAmountInCents);
    this.setQuantity(quantity);
    this.setRevenueScheduleType(revenueScheduleType);
  }

  setType(type) {
    Assertion.validString(type, _.values(AddOnTypeConstants));

    this._type = type;
  }

  setCode(code) {
    Assertion.string(code, { allowEmpty: false });

    this._code = code;
  }

  setUnitAmountInCents(unitAmountInCents) {
    Assertion.integer(unitAmountInCents, { allowNegative: false });

    this._unitAmountInCents = unitAmountInCents;
  }

  setQuantity(quantity) {
    Assertion.integer(quantity, { allowNegative: false });

    this._quantity = quantity;
  }

  setRevenueScheduleType(revenueScheduleType) {
    Assertion.string(revenueScheduleType, { allowEmpty: false, allowNull: true });

    this._revenueScheduleType = revenueScheduleType;
  }

  setAddOnRecordId(addOnRecordId) {
    Assertion.uuid(addOnRecordId);

    this._addOnRecordId = addOnRecordId;
  }

  getType() {
    return this._type;
  }

  getCode() {
    return this._code;
  }

  getUnitAmountInCents() {
    return this._unitAmountInCents;
  }

  getQuantity() {
    return this._quantity;
  }

  getRevenueScheduleType() {
    return this._revenueScheduleType;
  }

  getAddOnRecordId() {
    const addOnRecordId = this._addOnRecordId;
    Assertion.uuid(addOnRecordId);
    return addOnRecordId;
  }
}

module.exports = AddOn;

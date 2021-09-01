'use strict';

const {
  Assertion,
} = require('@funnelytics/utilities');

class SKUMapping {
  constructor({
    SKU,
    mappingId,
    targetId,
  }) {
    this.setSKU(SKU);
    this.setMappingId(mappingId);
    this.setTargetId(targetId);
  }

  getSKU() {
    return this._SKU;
  }

  getMappingId() {
    return this._mappingId;
  }

  getTargetId() {
    return this._targetId;
  }

  setSKU(SKU) {
    Assertion.string(SKU);

    this._SKU = SKU.toLowerCase();
  }

  setMappingId(mappingId) {
    Assertion.uuid(mappingId);

    this._mappingId = mappingId;
  }

  setTargetId(targetId) {
    Assertion.uuid(targetId);

    this._targetId = targetId;
  }
}

module.exports = SKUMapping;

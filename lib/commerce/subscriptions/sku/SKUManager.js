'use strict';

const _ = require('lodash');
const Promise = require('bluebird');

const {
  Assertion,
} = require('@funnelytics/utilities');

const SKUError = require('./errors/SKUError');
const ImplementationRequired = require('../errors/ImplementationRequired');
const SKUMapping = require('./SKUMapping');

class SKUManager {
  constructor({
    transacting,
  }) {
    this.setTransacting(transacting);
    this.setSKUMappings([]);
    this.setInitialized(false);
  }

  fetchAllSKUs() {
    return Promise.try(() => {
      if (this.isInitialized()) {
        return true;
      }

      return this.fetcher().then(mappings => {
        this.setSKUMappings(mappings);

        this.setInitialized(true);
      });
    });
  }

  fetcher() {
    throw new ImplementationRequired('Must implement the "fetcher" method.');
  }

  getMappingForSKU(sku) {
    Assertion.string(sku);

    if (!this.isInitialized()) {
      throw new SKUError('Must initialize before using "getMappingForSKU" method.');
    }

    return this.getSKUMappings().find(mappingItem => {
      return mappingItem.getSKU() === sku;
    });
  }

  hasMappingForSKU(sku) {
    Assertion.string(sku, {
      allowNull: true,
    });

    if (!sku) {
      return false;
    }

    if (!this.isInitialized()) {
      throw new SKUError('Must initialize before using "hasMappingForSKU" method.');
    }

    return !_.isEmpty(this.getMappingForSKU(sku));
  }

  getMappingIdBySKU(sku) {
    const mapping = this.getMappingForSKU(sku);

    if (!mapping) {
      return null;
    }

    return mapping.getMappingId();
  }

  getTargetIdBySKU(sku) {
    const mapping = this.getMappingForSKU(sku);

    if (!mapping) {
      return null;
    }

    return mapping.getTargetId();
  }

  getSKUMappings() {
    return this._productSkus;
  }

  getTransacting() {
    return this._transacting;
  }

  isInitialized() {
    return this._initialized;
  }

  setSKUMappings(productSkus) {
    Assertion.arrayOfInstancesOf(productSkus, SKUMapping);

    this._productSkus = productSkus;
  }

  setTransacting(transacting) {
    Assertion.transacting(transacting);

    this._transacting = transacting;
  }

  setInitialized(initialized) {
    Assertion.boolean(initialized);

    this._initialized = initialized;
  }
}

module.exports = SKUManager;

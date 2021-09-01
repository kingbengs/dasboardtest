'use strict';

const Promise = require('bluebird');

const {
  models: {
    dashboard: modelsDashboard,
  },
} = require('@funnelytics/shared-data');

const SKUManager = require('./SKUManager');
const SKUMapping = require('./SKUMapping');

class ProductSKUManager extends SKUManager {
  fetcher() {
    return Promise.try(() => {
      return modelsDashboard.ProductSku.forge().fetchAll({
        columns: ['id', 'sku', 'product'],
        transacting: this.getTransacting(),
      }).then(allProductSKUModels => {
        if (allProductSKUModels) {
          return allProductSKUModels.map(model => {
            return new SKUMapping({
              SKU: model.get('sku'),
              mappingId: model.get('id'),
              targetId: model.get('product'),
            });
          });
        }

        return [];
      });
    });
  }
}

module.exports = ProductSKUManager;

'use strict';

const Promise = require('bluebird');
const {
  Assertion,
} = require('@funnelytics/utilities');
const {
  models: {
    dashboard: modelsDashboard,
  },
} = require('@funnelytics/shared-data');

const SKUManager = require('./SKUManager');
const SKUMapping = require('./SKUMapping');

// TODO: Refactor all these classes to be much more standardized and just modify the following:
// TODO: model, targetId column... that's it!
class AddOnSKUManager extends SKUManager {
  fetcher() {
    return Promise.try(() => {
      return modelsDashboard.RecurlyAddOnSku.forge().fetchAll({
        columns: ['id', 'sku', 'add_on'],
        transacting: this.getTransacting(),
      }).then(allAddOnSKUModels => {
        if (allAddOnSKUModels) {
          return allAddOnSKUModels.map(model => {
            return new SKUMapping({
              SKU: model.get('sku'),
              mappingId: model.get('id'),
              targetId: model.get('add_on'),
            });
          });
        }

        return [];
      });
    });
  }

  fetchOne(SKU) {
    return Promise.try(() => {
      Assertion.string(SKU);

      return modelsDashboard.RecurlyAddOnSku.forge().where({
        sku: SKU,
      }).fetch({
        columns: ['id', 'sku', 'add_on'],
        transacting: this.getTransacting(),
      }).then(model => {
        if (model) {
          return new SKUMapping({
            SKU: model.get('sku'),
            mappingId: model.get('id'),
            targetId: model.get('add_on'),
          });
        }

        return null;
      });
    });
  }
}

module.exports = AddOnSKUManager;

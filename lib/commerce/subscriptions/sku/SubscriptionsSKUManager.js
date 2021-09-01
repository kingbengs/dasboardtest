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

class SubscriptionSKUManager extends SKUManager {
  fetcher() {
    return Promise.try(() => {
      return modelsDashboard.RecurlySubscriptionSku.forge().fetchAll({
        columns: ['id', 'sku', 'subscription'],
        transacting: this.getTransacting(),
      }).then(allSubscriptionSKUModels => {
        if (allSubscriptionSKUModels) {
          return allSubscriptionSKUModels.map(model => {
            return new SKUMapping({
              SKU: model.get('sku'),
              mappingId: model.get('id'),
              targetId: model.get('subscription'),
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

      return modelsDashboard.RecurlySubscriptionSku.forge().where({
        sku: SKU,
      }).fetch({
        columns: ['id', 'sku', 'subscription'],
        transacting: this.getTransacting(),
      }).then(model => {
        if (model) {
          return new SKUMapping({
            SKU: model.get('sku'),
            mappingId: model.get('id'),
            targetId: model.get('subscription'),
          });
        }

        return null;
      });
    });
  }
}

module.exports = SubscriptionSKUManager;

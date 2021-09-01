'use strict';

const Promise = require('bluebird');
const _ = require('lodash');
const {
  Assertion,
  constants: {
    RecurlySKUs,
  },
} = require('@funnelytics/utilities');
const {
  models: {
    dashboard: modelsDashboard,
  },
} = require('@funnelytics/shared-data');

const InvalidPurchase = require('./errors/InvalidPurchase');
const PurchaseOrderError = require('./errors/PurchaseOrderError');

// TODO: remove after delete workspaces subscription from Recurly
const BANNED_SUBSCRIPTION_SKUS = [
  // This subscription will always be added by the ProductAssociator and cannot be bought directly
  RecurlySKUs.ADDITIONAL_WORKSPACES_MONTHLY_1_FREE,
];
const BANNED_PRODUCT_SKUS = [
  'funnelytics_mastery',
];

const SUBSCRIPTIONS_KEY = 'subscriptions';
const PRODUCTS_KEY = 'products';

const ASSOCIATIONS = {
  [SUBSCRIPTIONS_KEY]: {},
  [PRODUCTS_KEY]: {},
};

class ProductAssociator {
  constructor({
    productSKUs = [],
    subscriptionSKUs = [],
    transacting,
  }) {
    this.setUnassociatedProductSKUs(productSKUs);
    this.setUnassociatedSubscriptionSKUs(subscriptionSKUs);
    this.setTransacting(transacting);
    this.setIsAssociated(false);
  }

  associate() {
    return Promise.try(() => {
      return Promise.all([
        this._getAssociatedAsync({
          skuModel: modelsDashboard.RecurlySubscriptionSku,
          foreignColumn: 'subscription',
          skus: this.getUnassociatedSubscriptionSKUs(),
          typeKey: SUBSCRIPTIONS_KEY,
        }),
        this._getAssociatedAsync({
          skuModel: modelsDashboard.ProductSku,
          foreignColumn: 'product',
          skus: this.getUnassociatedProductSKUs(),
          typeKey: PRODUCTS_KEY,
        }),
      ]).then(additionalSKUs => {
        Assertion.array(additionalSKUs);

        const allSubscriptionSKUs = additionalSKUs.reduce((subscriptionSKUsArray, results) => {
          return _.uniq(_.concat(subscriptionSKUsArray, _.get(results, [SUBSCRIPTIONS_KEY])));
        }, this.getUnassociatedSubscriptionSKUs());
        const allProductSKUs = additionalSKUs.reduce((productSKUsArray, results) => {
          return _.uniq(_.concat(productSKUsArray, _.get(results, [PRODUCTS_KEY])));
        }, this.getUnassociatedProductSKUs());

        this.setIsAssociated(true);
        this.setSubscriptionSKUs(allSubscriptionSKUs);
        this.setProductSKUs(allProductSKUs);
      });
    });
  }

  _getAssociatedAsync({
    skuModel,
    skus,
    foreignColumn,
    typeKey,
  } = {}) {
    return skuModel.forge().query(qb => {
      qb.whereIn('sku', skus);
    }).fetchAll({
      columns: [foreignColumn],
      transacting: this.getTransacting(),
    }).then(skuModels => {
      const productSKUsToAdd = [];
      const subscriptionSKUsToAdd = [];
      skuModels.forEach(subscriptionSKU => {
        const associatedProducts = _.get(ASSOCIATIONS, [
          typeKey,
          subscriptionSKU.get(foreignColumn),
          PRODUCTS_KEY,
        ], []);
        Assertion.arrayOfStrings(associatedProducts);
        associatedProducts.forEach(associatedProductSKU => {
          productSKUsToAdd.push(associatedProductSKU);
        });

        const associatedSubscriptions = _.get(ASSOCIATIONS, [
          typeKey,
          subscriptionSKU.get(foreignColumn),
          SUBSCRIPTIONS_KEY,
        ], []);
        Assertion.arrayOfStrings(associatedSubscriptions);
        associatedSubscriptions.forEach(associatedProductSKU => {
          subscriptionSKUsToAdd.push(associatedProductSKU);
        });
      });

      return {
        [PRODUCTS_KEY]: productSKUsToAdd,
        [SUBSCRIPTIONS_KEY]: subscriptionSKUsToAdd,
      };
    });
  }

  isAssociated() {
    return this._isAssociated;
  }

  getProductSKUs() {
    if (!this.isAssociated()) {
      throw new PurchaseOrderError('Cannot getProductSKUs() until the async associate() method has been called.');
    }

    return this._productSKUs;
  }

  getSubscriptionSKUs() {
    if (!this.isAssociated()) {
      throw new PurchaseOrderError('Cannot getSubscriptionSKUs() until the async associate() method has been called.');
    }

    return this._subscriptionSKUs;
  }

  getUnassociatedProductSKUs() {
    return this._unassociatedProductSKUs;
  }

  getUnassociatedSubscriptionSKUs() {
    return this._unassociatedSubscriptionSKUs;
  }

  getTransacting() {
    return this._transacting;
  }

  setIsAssociated(isAssociated) {
    Assertion.boolean(isAssociated);

    this._isAssociated = isAssociated;
  }

  setProductSKUs(productSKUs) {
    Assertion.arrayOfStrings(productSKUs);

    if (!this.isAssociated()) {
      throw new PurchaseOrderError('Cannot setProductSKUs() until the async associate() method has been called.');
    }

    this._productSKUs = productSKUs;
  }

  setSubscriptionSKUs(subscriptionSKUs) {
    Assertion.arrayOfStrings(subscriptionSKUs);

    if (!this.isAssociated()) {
      throw new PurchaseOrderError('Cannot setSubscriptionSKUs() until the async associate() method has been called.');
    }

    this._subscriptionSKUs = subscriptionSKUs;
  }

  setUnassociatedProductSKUs(productSKUs) {
    Assertion.arrayOfStrings(productSKUs);

    BANNED_PRODUCT_SKUS.forEach(bannedProductSKU => {
      if (productSKUs.includes(bannedProductSKU)) {
        throw new InvalidPurchase(`${bannedProductSKU} is not available for direct purchase.`);
      }
    });

    this._unassociatedProductSKUs = _.uniq(productSKUs);
  }

  setUnassociatedSubscriptionSKUs(subscriptionSKUs) {
    Assertion.arrayOfStrings(subscriptionSKUs);

    BANNED_SUBSCRIPTION_SKUS.forEach(bannedSubscriptionSKU => {
      if (subscriptionSKUs.includes(bannedSubscriptionSKU)) {
        throw new InvalidPurchase(`${bannedSubscriptionSKU} is not available for direct purchase.`);
      }
    });

    this._unassociatedSubscriptionSKUs = _.uniq(subscriptionSKUs);
  }

  setTransacting(transacting) {
    Assertion.transacting(transacting);

    this._transacting = transacting;
  }
}

module.exports = ProductAssociator;

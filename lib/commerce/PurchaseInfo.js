'use strict';

const _ = require('lodash');
const Promise = require('bluebird');

const {
  databases: {
    dashboard: BookshelfDashboard,
  },
  models: {
    dashboard: modelsDashboard,
  },
} = require('@funnelytics/shared-data');
const {
  Assertion,
} = require('@funnelytics/utilities');

const Helpers = require('../helpers/Helpers');

const MAX_SKU_LENGTH = 100;

class PurchaseInfo {
  constructor({
    commaSplitPlanCodes = '',
    commaSplitProductCodes = '',
    commaSplitAddonCodes = '',
  }) {
    this.setPlanCodes(
      Helpers.convertCommaSplitToUniqueArray(commaSplitPlanCodes, MAX_SKU_LENGTH),
    );

    this.setProductCodes(
      Helpers.convertCommaSplitToUniqueArray(commaSplitProductCodes, MAX_SKU_LENGTH),
    );

    this.setAddonCodes(
      Helpers.convertCommaSplitToUniqueArray(commaSplitAddonCodes, MAX_SKU_LENGTH),
    );
  }

  fetchPlanInformation(transacting) {
    return Promise.try(() => {
      Assertion.transacting(transacting);

      return modelsDashboard.RecurlySubscriptionSku.forge().query(qb => {
        qb.whereIn('sku', this.getPlanCodes());
      }).fetchAll({
        transacting,
        columns: [
          'sku',
          'description',
          'setup_price_in_cents',
          'period_price_in_cents',
          'period_unit',
          'period_length',
          'periods_in_term',
        ],
      }).then(planSkus => {
        const planArray = this.getPlanCodes().map(planCode => {
          const subscriptionSku = planSkus.find(subscriptionSkuRecord => {
            return subscriptionSkuRecord.get('sku') === planCode;
          });
          if (!subscriptionSku) {
            return {
              statusCode: 404,
              planCode,
            };
          }
          return {
            statusCode: 200,
            planCode: subscriptionSku.get('sku'),
            description: subscriptionSku.get('description'),
            setupPriceInCents: subscriptionSku.get('setup_price_in_cents'),
            periodPriceInCents: subscriptionSku.get('period_price_in_cents'),
            periodUnit: subscriptionSku.get('period_unit'),
            periodLength: subscriptionSku.get('period_length'),
            periodsInTerm: subscriptionSku.get('periods_in_term'),
          };
        });

        return PurchaseInfo.createHashFromArrayOnAttribute(planArray, 'planCode');
      });
    });
  }

  fetchProductInformation(transacting) {
    return Promise.try(() => {
      Assertion.transacting(transacting);

      return modelsDashboard.ProductSku.forge().query(qb => {
        qb.whereIn('sku', this.getProductCodes());
      }).fetchAll({
        columns: [
          'sku',
          'price_in_cents',
          'default_description',
        ],
      }).then(productSkus => {
        const productArray = this.getProductCodes().map(productCode => {
          const productSku = productSkus.find(productSkuRecord => {
            return productSkuRecord.get('sku') === productCode;
          });
          if (!productSku) {
            return {
              statusCode: 404,
              productCode,
            };
          }
          return {
            statusCode: 200,
            productCode: productSku.get('sku'),
            priceInCents: productSku.get('price_in_cents'),
            description: productSku.get('default_description'),
          };
        });

        return PurchaseInfo.createHashFromArrayOnAttribute(productArray, 'productCode');
      });
    });
  }

  async getAddonInformation() {
    const addons = this.getAddonCodes();

    if (addons.length <= 0) {
      return null;
    }

    const result = await BookshelfDashboard.knex.raw(
      `
        SELECT
          raos.add_on,
          raos.sku,
          raos.unit_amount_in_cents
        FROM recurly_add_on_skus raos
        WHERE raos.sku IN (
          ${_.map(addons, () => '?').join(', ')}
        );
      `,
      addons,
    );
    const info = _.map(result.rows, row => {
      return {
        addon: row.add_on,
        sku: row.sku,
        unit_amount_in_cents: row.unit_amount_in_cents,
      };
    });

    return PurchaseInfo.createHashFromArrayOnAttribute(info, 'sku');
  }

  getPlanCodes() {
    return this._planCodes;
  }

  getProductCodes() {
    return this._productCodes;
  }

  getAddonCodes() {
    return this._addonCodes;
  }

  setPlanCodes(planCodes) {
    Assertion.arrayOfStrings(planCodes);

    this._planCodes = planCodes;
  }

  setProductCodes(productCodes) {
    Assertion.arrayOfStrings(productCodes);

    this._productCodes = productCodes;
  }

  setAddonCodes(addonCodes) {
    Assertion.arrayOfStrings(addonCodes);

    this._addonCodes = addonCodes;
  }

  static createHashFromArrayOnAttribute(array, attribute) {
    Assertion.array(array);
    Assertion.string(attribute);

    return array.reduce((resultantHash, productObj) => {
      const attributeValue = _.get(productObj, attribute);
      if (!attributeValue) {
        throw new Error(`Must have attribute "${attribute}"`);
      }
      _.set(resultantHash, attributeValue, productObj);
      return resultantHash;
    }, {});
  }
}

module.exports = PurchaseInfo;

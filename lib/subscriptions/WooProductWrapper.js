const _ = require('lodash');

module.exports = class ProductWrapper {
  constructor(product) {
    this.product = _.pick(product, ['sku']);
  }

  getSku() {
    const sku = _.get(this.product, 'sku');

    // If empty string return undefined (just in case for consistency)
    if (_.isEmpty(sku)) {
      return undefined;
    }

    return sku;
  }
};

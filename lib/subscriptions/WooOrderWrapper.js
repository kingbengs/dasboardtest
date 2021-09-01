const _ = require('lodash');

const WooOrderStatuses = requireRoot('/constants/woo-order-statuses');

module.exports = class OrderWrapper {
  constructor(order) {
    this.order = order;
  }

  getStatus() {
    return _.get(this.order, 'status');
  }

  isCompleted() {
    return this.getStatus() === WooOrderStatuses.Completed;
  }

  isProcessing() {
    return this.getStatus() === WooOrderStatuses.Processing;
  }

  getId() {
    return _.get(this.order, 'id', -1);
  }

  getLineItems() {
    return _.get(this.order, 'line_items', []);
  }

  getUniqueLineItemProductIds() {
    const productIds = this.getLineItems().map(item => _.get(item, 'product_id', null))
      .filter(productId => productId !== null);

    return _.uniq(productIds);
  }

  getCustomerId() {
    return _.get(this.order, 'customer_id', -1);
  }

  getLineItemSkus() {
    return this.getLineItems()
      .filter(product => _.get(product, 'product_id', null) !== null)
      .map(product => _.get(product, 'sku', ''))
      .filter(sku => (sku !== '' && sku !== null));
  }
};

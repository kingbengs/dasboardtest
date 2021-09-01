const _ = require('lodash');

module.exports = class WooSubscriptionWrapper {
  constructor(subscription) {
    this.subscription = subscription;
  }

  getEmail() {
    return _.get(this.subscription, ['billing', 'email']);
  }

  getCustomerId() {
    return _.get(this.subscription, 'customer_id');
  }

  getLineItems() {
    return _.get(this.subscription, 'line_items', []);
  }

  getId() {
    return _.get(this.subscription, 'id', -1);
  }

  getStatus() {
    return _.get(this.subscription, 'status');
  }

  getPreviousPayment() {
    return _.get(this.subscription, 'date_paid_gmt', null);
  }

  getNextPayment() {
    return _.get(this.subscription, 'next_payment_date', null);
  }

  getTotal() {
    return _.get(this.subscription, 'total') || 0;
  }

  getMeta(key) {
    const collection = _.get(this.subscription, 'meta_data') || [];
    const affiliate = _.find(collection, item => {
      return item.key === key;
    });
    return _.get(affiliate, 'value') || null;
  }

  getAffiliate() {
    return this.getMeta('funnelytics_affiliate');
  }

  getLineItemSkus() {
    return this.getLineItems().filter(product => _.get(product, 'product_id', null) !== null).map(product => _.get(product, 'sku'));
  }
};

'use strict';

const {
  models: {
    dashboard: modelsDashboard,
  },
  errors,
} = require('@funnelytics/shared-data');
const {
  constants: {
    RecurlySKUs,
  },
  Assertion,
} = require('@funnelytics/utilities');
const Promise = require('bluebird');
const _ = require('lodash');

const RecurlyResponseError = require('../errors/RecurlyResponseError');

module.exports = class RecurlyUser {
  /**
   * constructor - Object representing user in Recurly.
   *
   * @param {type} wrapper RecurlyWrapper.
   * @param {type} id      User's UUID. Same UUID is used in Funnelytics and Recurly.
   */
  constructor(wrapper, id) {
    this._wrapper = wrapper;
    this.library = wrapper.getLibrary();
    this.id = id.toLowerCase();
    this.products = [];
    this.subscriptions = [];
  }

  getWrapper() {
    return this._wrapper;
  }

  setPaymentMethod(token, fingerprint, options = {}) {
    if (options.iteration >= 3) {
      const err = new Error('Failed to create Recurly user or set payment method.');
      return Promise.reject(err);
    }
    const details = {
      token_id: token,
    };
    if (fingerprint) {
      details.three_d_secure_action_result_token_id = fingerprint;
    }
    return this.library.billingInfo.update(this.id, details).catch(err => {
      if (err.statusCode === 404) {
        if (!options.iteration) {
          options.iteration = 0;
        }
        options.iteration++;
        return this.create().then(() => {
          return this.setPaymentMethod(token, fingerprint, options);
        });
      }
      throw new RecurlyResponseError(err.statusCode, err);
    });
  }

  unsetPaymentMethod() {
    return this.library.billingInfo.delete(this.id);
  }

  getPaymentMethod() {
    return this.library.billingInfo.get(this.id);
  }

  updateAccount({
    email,
  } = {}) {
    return Promise.try(async () => {
      Assertion.string(email);

      // Check if the account exists:
      try {
        await this.library.accounts.get(this.id);
      } catch (err) {
        const statusCode = _.get(err, ['statusCode']);
        if (statusCode === 404) {
          return null;
        }
        throw err;
      }


      return this.library.accounts.update(this.id, {
        email,
      });
    });
  }

  create(options = {}) {
    const columns = ['first_name', 'last_name', 'email'];
    return modelsDashboard.User.forge().where({
      id: this.id,
    }).fetch({
      columns,
      transacting: options.transacting,
    }).then(user => {
      // No checks are done to see if this account already exists in Recurly
      return this.library.accounts.create({
        account_code: this.id,
        first_name: user.get('first_name') || '',
        last_name: user.get('last_name') || '',
        email: user.get('email'),
      });
    });
  }

  getSubscriptions() {
    return this.library.subscriptions.listByAccount(this.id);
  }

  getInvoices() {
    return this.library.invoices.listByAccount(this.id);
  }

  addSubscription(subscription, options = {}) {
    this.subscriptions.push({
      subscription: _.extend({
        plan_code: subscription,
      }, options),
    });
  }

  addProduct(sku, description, amount, options = {}) {
    this.products.push({
      adjustment: _.extend({
        product_code: sku,
        description,
        unit_amount_in_cents: amount,
        quantity: 1,
        revenue_schedule_type: 'at_invoice',
      }, options),
    });
  }

  charge() {
    return this.library.purchases.create({
      account: {
        account_code: this.id,
      },
      currency: 'USD',
      collection_method: 'automatic',
      adjustments: this.products,
      subscriptions: this.subscriptions,
    });
  }

  cancelSubscription(subscriptionId) {
    return this.library.subscriptions.cancel(subscriptionId);
  }

  terminateSubscription(subscriptionId) {
    //* Passing the refund type prevent the Recurly method from breaking due to "Request path contains unescaped characters"
    const REFUND_TYPE = 'none';
    return this.library.subscriptions.terminate(subscriptionId, REFUND_TYPE);
  }

  getInvoicePdf(invoiceId) {
    return Promise.try(async () => {
      Assertion.integer(invoiceId, { allowNegative: false });

      let invoiceResponse;
      try {
        invoiceResponse = await this.library.invoices.get(invoiceId);
      } catch (e) {
        const statusCode = _.get(e, ['statusCode']);
        if (statusCode === 404) {
          // Prevent malicious users from discovering total invoice count
          throw errors.predefined.generic.forbidden;
        }
        throw e;
      }
      const accountLink = _.get(invoiceResponse, ['data', 'invoice', 'account']);
      const invoiceUserId = this.getWrapper().getUserIdFromAccountLink(accountLink);

      if (invoiceUserId !== this.id) {
        throw errors.predefined.generic.forbidden;
      }

      return this.library.invoices.retrievePdf(invoiceId);
    }).then(invoicePdfResponse => {
      const statusCode = _.get(invoicePdfResponse, ['statusCode']);
      if (statusCode !== 200) {
        throw new Error(`Received status code ${statusCode} when attempting to access invoice with id ${invoiceId}`);
      }

      return _.get(invoicePdfResponse, ['data']);
    });
  }

  // WARNING: has_recurly_account is not a real column
  /*
  isNew(options = {}) {
    const column = 'has_recurly_account';
    return modelsDashboard.User.forge().where({
      id: this.id,
      transacting: options.transacting,
    }).fetch({
      columns: [column],
    }).then(user => {
      return user.get(column);
    });
  }
  */
};

'use strict';

const Promise = require('bluebird');
const _ = require('lodash');
const {
  models: {
    dashboard: modelsDashboard,
  },
} = require('@funnelytics/shared-data');
const {
  Assertion,
} = require('@funnelytics/utilities');

const RecurlyWrapper = require('../recurly/RecurlyWrapper');
const WebhookEngine = require('./WebhookEngine');
const Subscription = require('../objects/Subscription');
const Invoice = require('../objects/Invoice');
const LineItem = require('../objects/LineItem');
const AddOn = require('../objects/AddOn');
const InvoicedUserLineItem = require('../objects/InvoicedUserLineItem');
const SKUManager = require('../sku/SKUManager');
const LineItemTypeConstants = require('../constants/LineItemTypeConstants');
const SubscriptionConstants = require('../constants/SubscriptionConstants');
const RecurlyConstants = require('../constants/RecurlyConstants');
const SlackIntegration = require('../../../integrations/SlackIntegration');
const ExternalServiceTableConstants = require('../external-services/constants/ExternalServiceTableConstants');

class RecurlyWebhookEngine extends WebhookEngine {
  fetchInvoice() {
    return Promise.try(() => {
      if (this.hasInvoice()) {
        return this.getInvoice();
      }

      const invoiceNumber = this.getWebhook().getInvoiceId();

      return RecurlyWrapper.getLibrary().invoices.get(invoiceNumber);
    }).then(recurlyInvoice => {
      const invoiceData = _.get(recurlyInvoice, [
        'data',
        'invoice',
      ]);

      const accountLink = _.get(invoiceData, 'account');

      const userId = RecurlyWrapper.getUserIdFromAccountLink(accountLink);

      const externalId = _.get(invoiceData, [
        'invoice_number',
        '_',
      ]);
      const state = _.get(invoiceData, 'state');
      const chargeTotalInCents = parseInt(_.get(invoiceData, [
        'total_in_cents',
        '_',
      ]), 10);
      const creditTotalInCents = RecurlyWrapper.getNormalizedItem(_.get(invoiceData, [
        'credit_payments',
        'credit_payment',
      ], [])).reduce((total, creditPaymentObj) => {
        return total + (parseInt(_.get(creditPaymentObj, [
          'amount_in_cents',
          '_',
        ]), 10) || 0);
      }, 0);
      const currency = _.get(invoiceData, 'currency');
      const closedAt = _.get(invoiceData, [
        'closed_at',
        '_',
      ], null);
      const adjustments = RecurlyWrapper.getNormalizedItem(_.get(invoiceData, [
        'line_items',
        'adjustment',
      ])).filter(adjustment => {
        return !_.isEmpty(_.get(adjustment, 'product_code'));
      });

      const subscriptionRelatedLineItems = adjustments.filter(adjustment => {
        return !_.isEmpty(_.get(adjustment, 'subscription'));
      }).map(subscriptionObject => {
        return RecurlyWebhookEngine.createLineItemFromAdjustment(subscriptionObject);
      });
      const subscriptions = subscriptionRelatedLineItems.filter(lineItem => {
        return !lineItem.isAddOn();
      });
      const addOns = subscriptionRelatedLineItems.filter(lineItem => {
        return lineItem.isAddOn();
      });
      const products = adjustments.filter(adjustment => {
        return _.isEmpty(_.get(adjustment, 'subscription'));
      }).map(productObject => {
        return RecurlyWebhookEngine.createLineItemFromAdjustment(productObject);
      });

      return new Invoice({
        userId,
        externalId,
        state,
        chargeTotalInCents,
        creditTotalInCents,
        currency,
        closedAt,
        subscriptions,
        products,
        addOns,
      });
    });
  }

  static createLineItemFromAdjustment(adjustment) {
    const subscriptionLink = _.get(adjustment, ['subscription']);
    const subscriptionId = subscriptionLink
      ? RecurlyWebhookEngine.getSubscriptionIdFromSubscriptionLink(subscriptionLink)
      : null;

    let SKU = _.get(adjustment, ['product_code']);

    if (!_.isString(SKU)) {
      SKU = null;
    }

    return new LineItem({
      externalId: _.get(adjustment, ['uuid']),
      subscriptionId,
      description: _.get(adjustment, ['description']),
      SKU,
      totalInCents: parseInt(_.get(adjustment, ['total_in_cents', '_']), 10),
      quantity: parseInt(_.get(adjustment, ['quantity', '_']), 10),
      origin: _.get(adjustment, ['origin']),
    });
  }

  fetchSubscription() {
    return Promise.try(async () => {
      if (this.hasSubscription()) {
        return this.getSubscription();
      }

      const subscriptionId = this.getWebhook().getSubscriptionId();

      // TODO: Should handle missing subscription ID.

      const recurlySubscription = await RecurlyWrapper.getLibrary().subscriptions.get(subscriptionId);

      const subscriptionData = _.get(recurlySubscription, [
        'data',
        'subscription',
      ]);

      const accountLink = _.get(subscriptionData, 'account');

      const userId = RecurlyWrapper.getUserIdFromAccountLink(accountLink);

      let status = '';
      switch (_.get(subscriptionData, 'state')) {
        case RecurlyConstants.SUBSCRIPTION_STATE_ACTIVE:
          status = SubscriptionConstants.STATUS_ACTIVE;
          break;
        case RecurlyConstants.SUBSCRIPTION_STATE_CANCELED:
          status = SubscriptionConstants.STATUS_CANCELLING;
          break;
        default:
          status = SubscriptionConstants.STATUS_INACTIVE;
          break;
      }

      const SKU = _.get(subscriptionData, [
        'plan',
        'plan_code',
      ]);

      const externalId = _.get(subscriptionData, 'uuid');

      const currentTermEndTime = _.get(subscriptionData, [
        'current_term_ends_at',
        '_',
      ]);

      const currentPeriodEndTime = _.get(subscriptionData, [
        'current_period_ends_at',
        '_',
      ]);

      const unitAmountInCents = parseInt(_.get(subscriptionData, [
        'unit_amount_in_cents',
        '_',
      ]), 10);

      const remainingBillingCycles = parseInt(_.get(subscriptionData, [
        'remaining_billing_cycles',
        '_',
      ]), 10);

      const addOnsRaw = _.get(subscriptionData, [
        'subscription_add_ons',
        'subscription_add_on',
      ]);
      let addOns = [];
      if (addOnsRaw) {
        if (_.isArray(addOnsRaw)) {
          addOns = addOnsRaw;
        } else if (_.isObject(addOnsRaw)) {
          addOns = [addOnsRaw];
        }
      }

      const addOnObjects = addOns.map(addOn => {
        return new AddOn({
          type: _.get(addOn, ['add_on_type']),
          code: _.get(addOn, ['add_on_code']),
          unitAmountInCents: parseInt(_.get(addOn, ['unit_amount_in_cents', '_'], 0), 10),
          quantity: parseInt(_.get(addOn, ['quantity', '_']), 10),
          revenueScheduleType: _.get(addOn, ['revenue_schedule_type'], null),
        });
      });

      return new Subscription({
        userId,
        SKU,
        status,
        externalId,
        currentTermEndTime,
        currentPeriodEndTime,
        unitAmountInCents,
        remainingBillingCycles,
        addOns: addOnObjects,
      });
    });
  }

  fetchSubscriptionRecordAsync({
    subscriptionId,
    transacting,
    columns,
  }) {
    return Promise.try(() => {
      Assertion.uuid(subscriptionId);
      Assertion.transacting(transacting);
      Assertion.arrayOfStrings(columns);

      return modelsDashboard.RecurlySubscription.forge().where({
        id: subscriptionId,
      }).fetch({
        transacting,
        columns,
      });
    });
  }

  fetchUserSubscriptionRecordAsync({
    externalId,
    transacting,
    columns,
    withRelated,
  }) {
    return Promise.try(() => {
      Assertion.transacting(transacting);
      Assertion.string(externalId);
      Assertion.arrayOfStrings(columns);
      Assertion.array(withRelated);

      return modelsDashboard.RecurlyUserSubscription.forge().where({
        external_id: externalId,
      }).fetch({
        transacting,
        columns,
        withRelated,
      });
    });
  }

  saveInvoice({
    invoice,
    transacting,
  }) {
    return Promise.try(async () => {
      Assertion.instanceOf(invoice, Invoice);
      Assertion.transacting(transacting);

      const existingInvoice = await modelsDashboard.RecurlyInvoice.forge().where({
        external_id: invoice.getExternalId(),
      }).fetch({
        transacting,
        columns: ['id'],
      });

      const netTotalInCents = Math.max(invoice.getChargeTotalInCents() - invoice.getCreditTotalInCents(), 0);

      if (existingInvoice) {
        return modelsDashboard.RecurlyInvoice.forge().where({
          external_id: invoice.getExternalId(),
        }).save({
          state: invoice.getState(),
          total_in_cents: netTotalInCents,
          currency: invoice.getCurrency(),
          closed_at: invoice.getClosedAt(),
        }, {
          transacting,
          patch: true,
          returning: ['id'],
        });
      }

      return modelsDashboard.RecurlyInvoice.forge().save({
        external_id: invoice.getExternalId(),
        user: invoice.getUserId(),
        state: invoice.getState(),
        total_in_cents: netTotalInCents,
        currency: invoice.getCurrency(),
        closed_at: invoice.getClosedAt(),
      }, {
        transacting,
        returning: ['id'],
      });
    });
  }

  saveLineItem({
    invoiceId,
    lineItem,
    skuManager,
    transacting,
    type,
  }) {
    return Promise.try(async () => {
      Assertion.uuid(invoiceId);
      Assertion.instanceOf(lineItem, LineItem);
      Assertion.instanceOf(skuManager, SKUManager);
      Assertion.transacting(transacting);
      Assertion.validString(type, _.values(LineItemTypeConstants));

      const modelOptions = {
        external_id: lineItem.getExternalId(),
        invoice: invoiceId,
        description: lineItem.getDescription(),
        product_code: lineItem.getSKU(),
        total_in_cents: lineItem.getTotalInCents(),
        quantity: lineItem.getQuantity(),
        external_subscription_id: lineItem.getSubscriptionId(),
        origin: lineItem.getOrigin(),
      };

      const isRecognizedSKU = skuManager.hasMappingForSKU(lineItem.getSKU());
      if (isRecognizedSKU) {
        const mappingId = skuManager.getMappingIdBySKU(lineItem.getSKU());
        if (type === LineItemTypeConstants.TYPE_PRODUCT) {
          _.set(modelOptions, 'product_sku', mappingId);
        } else if (type === LineItemTypeConstants.TYPE_SUBSCRIPTION) {
          _.set(modelOptions, 'subscription_sku', mappingId);
        } else if (type === LineItemTypeConstants.TYPE_ADD_ON) {
          _.set(modelOptions, 'add_on_sku', mappingId);
        }
      } else {
        SlackIntegration.reportMissingLineItemSKU({
          type: this.getWebhookType(),
          invoiceId: String(invoiceId),
          externalId: lineItem.getExternalId(),
          productCode: lineItem.getSKU(),
          description: lineItem.getDescription(),
          lineItemType: type,
        });
      }

      const existingItem = await modelsDashboard.RecurlyInvoiceItem.forge().where({
        external_id: lineItem.getExternalId(),
      }).fetch({
        transacting,
        columns: ['id'],
      });

      if (existingItem) {
        return modelsDashboard.RecurlyInvoiceItem.forge().where({
          external_id: lineItem.getExternalId(),
        }).save(modelOptions, {
          transacting,
          patch: true,
        });
      }

      return modelsDashboard.RecurlyInvoiceItem.forge().save(modelOptions, {
        transacting,
      });
    });
  }

  saveUserSubscription({
    subscription,
    transacting,
    returning,
  }) {
    return Promise.try(() => {
      Assertion.instanceOf(subscription, Subscription);
      Assertion.transacting(transacting);
      Assertion.arrayContains(returning, 'id');

      return modelsDashboard.RecurlyUserSubscription.forge().save({
        external_id: subscription.getExternalId(),
        user: subscription.getUserId(),
        subscription: subscription.getSubscriptionRecordId(),
        status: subscription.getStatus(),
        tapfiliate_click_id: subscription.getAffiliateCode(),
        term_ends_at: subscription.getCurrentTermEndTime(),
        period_ends_at: subscription.getCurrentPeriodEndTime(),
        unit_amount_in_cents: subscription.getUnitAmountInCents(),
        remaining_billing_cycles: subscription.getRemainingBillingCycles(),
        [ExternalServiceTableConstants.EXTERNAL_STATUS_COLUMN]: subscription.getExternalStatus(),
      }, {
        transacting,
        returning,
      });
    }).then(userSubscription => {
      return this.updateSubscriptionAddOns({
        subscription,
        userSubscriptionId: userSubscription.get('id'),
        addOns: subscription.getAddOns(),
        transacting,
      }).then(() => {
        return userSubscription;
      });
    });
  }

  updateUserSubscription({
    subscription,
    transacting,
    returning,
  }) {
    return Promise.try(() => {
      Assertion.instanceOf(subscription, Subscription);
      Assertion.transacting(transacting);
      Assertion.arrayContains(returning, 'id');

      return modelsDashboard.RecurlyUserSubscription.forge().where({
        external_id: subscription.getExternalId(),
      }).save({
        subscription: subscription.getSubscriptionRecordId(),
        status: subscription.getStatus(),
        term_ends_at: subscription.getCurrentTermEndTime(),
        period_ends_at: subscription.getCurrentPeriodEndTime(),
        unit_amount_in_cents: subscription.getUnitAmountInCents(),
        remaining_billing_cycles: subscription.getRemainingBillingCycles(),
      }, {
        transacting,
        returning,
        patch: true,
      });
    }).then(userSubscription => {
      return this.updateSubscriptionAddOns({
        subscription,
        userSubscriptionId: userSubscription.get('id'),
        addOns: subscription.getAddOns(),
        transacting,
      }).then(() => {
        return userSubscription;
      });
    });
  }

  updateSubscriptionAddOns({
    subscription,
    userSubscriptionId,
    addOns,
    transacting,
  }) {
    Assertion.instanceOf(subscription, Subscription);
    Assertion.uuid(userSubscriptionId);
    Assertion.arrayOfInstancesOf(addOns, AddOn);
    Assertion.transacting(transacting);

    return modelsDashboard.RecurlyUserSubscriptionAddOn.forge().where({
      user_subscription: userSubscriptionId,
    }).destroy({
      transacting,
      require: false,
    }).then(async () => {
      return Promise.map(addOns, addOn => {
        return modelsDashboard.RecurlyUserSubscriptionAddOn.forge().save({
          user_subscription: userSubscriptionId,
          add_on: addOn.getAddOnRecordId(),
          unit_amount_in_cents: addOn.getUnitAmountInCents(),
          quantity: addOn.getQuantity(),
          revenue_schedule_type: addOn.getRevenueScheduleType(),
          add_on_type: addOn.getType(),
        }, {
          transacting,
        });
      });
    });
  }

  fetchInvoiceItemIdsForLineItems({
    invoicedUserLineItems,
    transacting,
  }) {
    return Promise.try(async () => {
      Assertion.arrayOfInstancesOf(invoicedUserLineItems, InvoicedUserLineItem);
      Assertion.transacting(transacting);

      const externalIds = invoicedUserLineItems.map(item => {
        return item.getExternalId();
      });

      const invoiceItems = await modelsDashboard.RecurlyInvoiceItem.forge().query(qb => {
        qb.whereIn('external_id', externalIds);
      }).fetchAll({
        transacting,
        columns: ['id', 'external_id'],
      });

      if (!invoiceItems || _.get(invoiceItems, 'length', 0) === 0) {
        return invoicedUserLineItems;
      }

      invoiceItems.forEach(invoiceItem => {
        const lineItemToTarget = _.find(invoicedUserLineItems, lineItem => {
          return lineItem.getExternalId() === invoiceItem.get('external_id');
        });

        if (!lineItemToTarget) {
          return;
        }

        lineItemToTarget.setInvoiceItemId(invoiceItem.get('id'));
      });

      return invoicedUserLineItems;
    });
  }

  static getSubscriptionIdFromSubscriptionLink(subscriptionLink) {
    const subscriptionHref = _.get(subscriptionLink, [
      '$',
      'href',
    ]);

    const beforeSubscriptionString = '/subscriptions/';
    const beforeSubscriptionStringIndex = subscriptionHref.indexOf(beforeSubscriptionString);
    const subscriptionIdFromLink = subscriptionHref.slice(beforeSubscriptionStringIndex + beforeSubscriptionString.length);
    return subscriptionIdFromLink;
  }
}

module.exports = RecurlyWebhookEngine;

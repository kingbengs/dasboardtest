'use strict';

const _ = require('lodash');
const Promise = require('bluebird');
const {
  Assertion,
  constants: {
    Permissions,
    RecurlySKUs,
  },
} = require('@funnelytics/utilities');
const {
  databases: {
    dashboard: BookshelfDashboard,
  },
  permissions: {
    PermissionChecker,
  },
} = require('@funnelytics/shared-data');

const ManagerEngine = require('./ManagerEngine');
const RecurlyWrapper = require('../recurly/RecurlyWrapper');
const MockedRecurlyWebhook = require('../recurly/webhooks/MockedRecurlyWebhook');
const HandledWebhookConstants = require('../constants/HandledWebhookConstants');
const RecurlyWebhookEngine = require('../webhook-engines/RecurlyWebhookEngine');
const WebhookHandler = require('../WebhookHandler');
const RecurlyWebhook = require('../recurly/webhooks/RecurlyWebhook');
const LineItemConstants = require('../constants/LineItemConstants');

class RecurlyManagerEngine extends ManagerEngine {
  fetchInvoices() {
    return Promise.try(() => {
      const user = RecurlyWrapper.getRecurlyUser(this.getUserId());

      return user.getInvoices();
    });
  }

  fetchPaymentMethod() {
    return Promise.try(() => {
      const user = RecurlyWrapper.getRecurlyUser(this.getUserId());

      return user.getPaymentMethod();
    });
  }

  fetchSetPaymentMethod(token, fingerprint) {
    return Promise.try(() => {
      const user = RecurlyWrapper.getRecurlyUser(this.getUserId());

      return user.setPaymentMethod(token, fingerprint);
    });
  }

  fetchUpdateAccount(options) {
    return Promise.try(() => {
      const user = RecurlyWrapper.getRecurlyUser(this.getUserId());

      return user.updateAccount(options);
    });
  }

  fetchUnsetPaymentMethod() {
    return Promise.try(() => {
      const user = RecurlyWrapper.getRecurlyUser(this.getUserId());

      return user.unsetPaymentMethod();
    });
  }

  fetchSubscriptions() {
    return Promise.try(() => {
      const user = RecurlyWrapper.getRecurlyUser(this.getUserId());

      return user.getSubscriptions();
    });
  }

  fetchSubscriptionsFromDb({
    isActiveOnly = true,
    columns,
    transacting,
    requiredPermissions = [],
  }) {
    return Promise.try(() => {
      Assertion.boolean(isActiveOnly);
      Assertion.transacting(transacting);
      Assertion.arrayOfStrings(requiredPermissions);
      requiredPermissions.forEach(permission => {
        Assertion.validString(permission, Permissions.ALL_PERMISSIONS);
      });
      Assertion.arrayOfStrings(columns);
      const VALID_COLUMNS = ['id', 'external_id', 'status', 'term_ends_at'];
      columns.forEach(column => {
        Assertion.validString(column, VALID_COLUMNS);
      });

      const hasRequiredPermissions = requiredPermissions.length > 0;
      const PERMISSIONS_TABLE_ALIAS = 'permissions';
      const permissionsConditional = hasRequiredPermissions
        ? `AND ${PERMISSIONS_TABLE_ALIAS}.name IN (
            '${requiredPermissions.join('\', \'')}'
          )`
        : '';
      const USER_SUBSCRIPTION_ALIAS = 'rus';
      const activeConditional = isActiveOnly
        ? `AND ${PermissionChecker.createSubscriptionActiveSQLFilter(USER_SUBSCRIPTION_ALIAS)}`
        : '';
      const selectStatement = columns.map(column => {
        return `${USER_SUBSCRIPTION_ALIAS}.${column}`;
      }).join(', ');
      return BookshelfDashboard.knex.raw(`
        SELECT DISTINCT ${selectStatement}
        FROM permissions ${PERMISSIONS_TABLE_ALIAS}
        INNER JOIN recurly_subscription_permissions pp on ${PERMISSIONS_TABLE_ALIAS}.id = pp.permission
        INNER JOIN recurly_user_subscriptions ${USER_SUBSCRIPTION_ALIAS} ON pp.subscription = ${USER_SUBSCRIPTION_ALIAS}.subscription
        INNER JOIN users u on ${USER_SUBSCRIPTION_ALIAS}."user" = u.id
        INNER JOIN recurly_subscriptions p2 on pp.subscription = p2.id
        WHERE u.id = :userId
        ${permissionsConditional}
        ${activeConditional}
      `, {
        userId: this.getUserId(),
      }).transacting(transacting).then(result => {
        return _.get(result, 'rows', []);
      });
    });
  }

  fetchCancelSubscription(subscriptionId) {
    return Promise.try(() => {
      const user = RecurlyWrapper.getRecurlyUser(this.getUserId());

      return user.cancelSubscription(subscriptionId);
    });
  }

  fetchTerminateSubscriptionAsync(subscriptionId) {
    return Promise.try(() => {
      const user = RecurlyWrapper.getRecurlyUser(this.getUserId());

      return user.terminateSubscription(subscriptionId);
    });
  }

  fetchUpdateAppDataFromInvoices(invoices) {
    return Promise.try(() => {
      const webhooksToExecute = [];
      invoices.filter(invoice => {
        return _.get(invoice, 'state') === 'paid';
      }).forEach(paidInvoice => {
        const invoiceWebhook = new MockedRecurlyWebhook({
          type: HandledWebhookConstants.PAID_INVOICE,
          invoiceNumber: parseInt(_.get(paidInvoice, ['invoice_number', '_']), 10),
        });
        webhooksToExecute.push(invoiceWebhook);
        RecurlyWrapper.getNormalizedItem(_.get(paidInvoice, ['line_items', 'adjustment'])).filter(adjustment => {
          return !_.isEmpty(_.get(adjustment, 'subscription'));
        }).forEach(subscriptionAdjustment => {
          const adjustmentOrigin = _.get(subscriptionAdjustment, 'origin');
          if (adjustmentOrigin !== LineItemConstants.ORIGIN_PLAN) {
            // Only mock subscriptions and not add_ons (causes duplicate external_id error)
            return;
          }
          const subscriptionLink = _.get(subscriptionAdjustment, 'subscription');
          const subscriptionId = RecurlyWebhookEngine.getSubscriptionIdFromSubscriptionLink(subscriptionLink);
          const subscriptionWebhook = new MockedRecurlyWebhook({
            type: HandledWebhookConstants.NEW_SUBSCRIPTION,
            subscriptionUUID: subscriptionId,
          });
          webhooksToExecute.push(subscriptionWebhook);
        });
      });

      return this._executeMultipleMockedWebhooks(webhooksToExecute);
    });
  }

  fetchUpdateAppDataFromSubscriptions(subscriptions) {
    return Promise.try(() => {
      const webhooksToExecute = subscriptions.map(subscription => {
        const subscriptionId = _.get(subscription, 'uuid');
        const subscriptionWebhook = new MockedRecurlyWebhook({
          type: HandledWebhookConstants.NEW_SUBSCRIPTION,
          subscriptionUUID: subscriptionId,
        });

        return subscriptionWebhook;
      });

      return this._executeMultipleMockedWebhooks(webhooksToExecute);
    });
  }

  _executeMultipleMockedWebhooks(mockedWebhooks) {
    return Promise.try(() => {
      Assertion.arrayOfInstancesOf(mockedWebhooks, MockedRecurlyWebhook);

      return Promise.map(mockedWebhooks, mockedWebhook => {
        return Promise.try(() => {
          const webhook = new RecurlyWebhook(mockedWebhook.toXML());
          const recurlyWebhookEngine = new RecurlyWebhookEngine(webhook);
          const handler = new WebhookHandler({
            webhookEngine: recurlyWebhookEngine,
            SubscriptionManagerEngineClass: RecurlyManagerEngine,
          });
          return handler.handleWebhook();
        }).catch(err => {
          WebhookHandler.reportUnrecognizedErrors(err, mockedWebhook.toXML());

          throw err;
        });
      });
    });
  }

  fetchPurchaseSubscriptions({
    skus = [],
    nextBillDate = undefined,
  } = {}) {
    return Promise.try(() => {
      Assertion.arrayOfStrings(skus, { allowEmptyArray: false });
      skus.forEach(sku => {
        Assertion.validString(sku, RecurlySKUs.VALID_SKUS);
      });
      if (nextBillDate !== undefined) {
        Assertion.string(nextBillDate);
      }

      const user = RecurlyWrapper.getRecurlyUser(this.getUserId());

      skus.forEach(sku => {
        user.addSubscription(sku, {
          next_bill_date: nextBillDate,
        });
      });

      return user.charge();
    });
  }

  fetchInvoicePdf(invoiceId) {
    return Promise.try(() => {
      Assertion.integer(invoiceId);

      const user = RecurlyWrapper.getRecurlyUser(this.getUserId());

      return user.getInvoicePdf(invoiceId);
    });
  }

  getNormalizedItems(item) {
    return RecurlyWrapper.getNormalizedItem(item);
  }
}

module.exports = RecurlyManagerEngine;

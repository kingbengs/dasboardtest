const express = require('express');

const router = express.Router();
const {
  models: {
    dashboard: modelsDashboard,
  },
  databases: {
    dashboard: BookshelfDashboard,
  },
  errors: {
    predefined: {
      generic: {
        forbidden: ForbiddenError,
      },
    },
  },
} = require('@funnelytics/shared-data');
const Promise = require('bluebird');
const _ = require('lodash');
const uuid = require('uuid/v4');

const products = require('../lib/commerce/products');
// const DripIntegration = require('../lib/integrations/Drip');
const WebhookHandler = require('../lib/commerce/subscriptions/WebhookHandler');
const RecurlyWebhookEngine = require('../lib/commerce/subscriptions/webhook-engines/RecurlyWebhookEngine');
const RecurlyWebhook = require('../lib/commerce/subscriptions/recurly/webhooks/RecurlyWebhook');
const RecurlyManagerEngine = require('../lib/commerce/subscriptions/manager-engines/RecurlyManagerEngine');
const EmailHelper = require('../lib/emails/EmailHelper');

const { LogLevels } = requireRoot('/config/winston');
const {
  loggerWooSubscriptionError,
  loggerModifySubscription,
  loggerDoNotModifySubscription,
  // loggerDripError,
  loggerWooOrderError,
  loggerOrderStatus,
  loggerSubscriptionCreationError,
  loggerOrderNotProcessed,
  loggerMissingCustomerEmail,
  loggerMissingUser,
  loggerUnexpected,
  loggerOrderFailed,
  loggerOrderNewTransaction,
  loggerOrderCompleted,
} = requireRoot('/config/winston/loggers');

const OrderTrackerStatus = requireRoot('/constants/order-tracker-statuses');

const {
  Updater: SubscriptionUpdater,
  SubscriptionResponse,
  WooCommerceCustomWrapper,
  WooSubscriptionWrapper,
  SubscriptionStatuses,
} = requireRoot('/lib/subscriptions');

router.post('/recurly', (req, res, next) => {
  return Promise.try(() => {
    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    const [webhookKey] = Buffer.from(b64auth, 'base64').toString().split(':');

    if (webhookKey !== process.env.RECURLY_WEBHOOK_KEY) {
      throw ForbiddenError;
    }

    const webhook = new RecurlyWebhook(req.body);
    const recurlyWebhookEngine = new RecurlyWebhookEngine(webhook);
    const handler = new WebhookHandler({
      webhookEngine: recurlyWebhookEngine,
      SubscriptionManagerEngineClass: RecurlyManagerEngine,
    });
    return handler.handleWebhook();
  }).then(resultValue => {
    const success = resultValue !== false;

    res.json({
      success,
    });

    return resultValue;
  }).then(postWebhookOptions => {
    return WebhookHandler.handlePostWebhookActions(postWebhookOptions);
  }).catch(err => {
    WebhookHandler.reportUnrecognizedErrors(err, req.body);

    return next(err);
  });
});

router.post('/woo-order', (req, res) => {
  return Promise.try(async () => {
    const orderId = _.get(req, ['body', 'id'], 'no req.body.id');
    const order = await WooCommerceCustomWrapper.getOrderById(orderId);

    // Do not process the order in these circumstances
    if (
      order.getCustomerId() === -1
    || order.getId() === -1
    || !order.isProcessing()
    ) {
      let message = `This order was not processed: ${orderId}`;
      if (order.getCustomerId() === -1) {
        message = `Woo Order did not come with customer ID when queried at '${orderId}'`;
      } else if (order.getId() === -1) {
        message = `Woo Order did not come with an order ID when queried at '${orderId}'`;
      } else if (!order.isProcessing()) {
        message = `Order with ID '${orderId}' does not have a status of processing at this time, it has a status of ${order.getStatus()} and will not be processed at this time..`;
      }
      loggerOrderNotProcessed.info({
        request: req,
        message,
      });
      return res.send(message);
    }

    const customer = await WooCommerceCustomWrapper.getCustomer(order.getCustomerId());

    if (!customer.getEmail()) {
      const message = `Missing customer email for order '${order.getId()}`;
      loggerMissingCustomerEmail.logWithOptions({
        message,
        request: req,
      });
      throw new Error(message);
    }


    // Doing this outside of the main transaction to prevent concurrent order processing for the same order
    let orderTracker = null;
    let user = null;
    let allProductSkus = {};
    const transactionId = uuid();
    return Promise.try(async () => {
      await BookshelfDashboard.transaction(async transacting => {
        user = await modelsDashboard.User
          .forge()
          .where({ email: customer.getEmail() })
          .fetch({
            columns: ['id'],
          });

        if (!user) {
          const error = new Error(`Missing user for order ${order.getId()} when queried with email ${customer.getEmail()}`);
          loggerMissingUser.logWithOptions({ error });
          throw error;
        }

        orderTracker = await modelsDashboard.Order
          .forge()
          .where({ woo_order_id: order.getId() })
          .fetch({
            columns: ['id', 'status'],
            transacting,
          });

        const allProductSkuModels = await modelsDashboard.ProductSku.forge()
          .fetchAll({
            columns: ['sku', 'product'],
            transacting,
          });

        if (allProductSkuModels) {
          allProductSkus = allProductSkuModels.reduce((skuToProduct, currProduct) => {
            _.set(skuToProduct, currProduct.get('sku'), currProduct.get('product'));

            return skuToProduct;
          }, {});
        }

        // Do not process orders that are currently being processed or that have been processed in the past
        if (!orderTracker) {
          orderTracker = new modelsDashboard.Order({
            user: user.get('id'),
            woo_order_id: order.getId(),
          });
          loggerOrderNewTransaction.info({ message: `Creating a new transaction for order ${order.getId()} with transaction id ${transactionId}` });
          return orderTracker.save({ status: OrderTrackerStatus.Processing, transaction_id: transactionId }, { transacting });
        }

        if (orderTracker.get('status') === OrderTrackerStatus.Failed) {
          loggerOrderNewTransaction.info({ message: `Retrying transaction for order ${order.getId()} with transaction id ${transactionId}` });
          return orderTracker.save({ status: OrderTrackerStatus.Processing, transaction_id: transactionId }, { transacting, patch: true });
        }

        if (orderTracker.get('status') === OrderTrackerStatus.Processing
        || orderTracker.get('status') === OrderTrackerStatus.Completed
        ) {
          const error = new Error(
            `The order with ID ${order.getId()} is already of the status ${orderTracker.get('status')} and was not processed at this time, even though the WooCommerce order had a status of ${order.getStatus()} at this time.`,
          );
          loggerOrderNotProcessed.logWithOptions({
            request: req,
            error,
          });
          throw error;
        } else {
          const error = new Error(`Unhandled order tracker condition for order ${order.getId()} when queried with email ${customer.getEmail()}`);
          loggerUnexpected.logWithOptions({ error, request: req });
          throw error;
        }
      });

      // We have a customer with an email and an identified woo commerce order that is currently processing
      const recognizedProductSkus = _.keys(allProductSkus);
      const [recognizedProducts, relatedSubscriptions] = await Promise.all([
        Promise.map(order.getUniqueLineItemProductIds(),
          productId => { return WooCommerceCustomWrapper.getProduct(productId); })
          .then(allProducts => { return allProducts.filter(product => { return recognizedProductSkus.includes(product.getSku()); }); }),
        Promise.map(order.getUniqueLineItemProductIds(),
          productId => {
            return WooCommerceCustomWrapper.getSubscriptions({
              product: productId,
              customer: order.getCustomerId(),
              status: SubscriptionStatuses.Active,
            });
          }),
      ]);

      const subscriptions = _.flatten(relatedSubscriptions)
        .map(subscription => { return new WooSubscriptionWrapper(subscription); })
        .filter(subscription => { return subscription.getId() !== -1; });

      const uniqueSubscriptions = _.uniqBy(subscriptions, subscription => { return subscription.getId(); });

      return BookshelfDashboard.transaction(async transacting => {
        const [responses] = await Promise.all([
          Promise.map(uniqueSubscriptions, uniqueSubscription => {
            const subscriptionUpdater = new SubscriptionUpdater({
              wooSubscription: uniqueSubscription,
              email: customer.getEmail(),
              transacting,
              response: new SubscriptionResponse({ email: customer.getEmail() }),
            });

            return subscriptionUpdater.updateSubscriptions(req);
          }),
          Promise.map(recognizedProducts, async productSku => {
            const productId = _.get(allProductSkus, productSku.getSku());

            const userProductQuery = {
              user: user.get('id'),
              product: productId,
            };

            const currentProductCount = await modelsDashboard.UserProduct
              .forge()
              .where(userProductQuery)
              .count({ transacting });

            if (currentProductCount > 0) {
              return;
            }

            const newUserProduct = new modelsDashboard.UserProduct();

            await newUserProduct.save(userProductQuery, { transacting });
          }),
        ]);

        const currentOrder = await modelsDashboard.Order
          .forge()
          .where({
            woo_order_id: order.getId(),
            transaction_id: transactionId,
            status: OrderTrackerStatus.Processing,
          })
          .fetch({
            columns: ['id', 'status'],
            transacting,
          });

        if (!currentOrder) {
        // We are not currently processing this order and must not commit these changes.
          throw new Error(
            `Could not find order ${order.getId()} with transactiong ID ${transactionId} that is currently ${OrderTrackerStatus.Processing}`,
          );
        }

        await currentOrder.save({ status: OrderTrackerStatus.Completed }, { transacting, patch: true });

        loggerOrderCompleted.info({
          request: req,
          message: `Order ${order.getId()} with transactiong ID ${transactionId} marked completed.`,
        });

        return responses;
      }).then(async responses => {
      // await Promise.map(responses, response => response.sendAllDripEvents().catch(err => {
      //   loggerDripError.logWithOptions({ request: req, error: err });
      // }));
        responses.forEach(response => {
          if (response.subscriptionsModified()) {
            loggerModifySubscription.logWithOptions({ request: req, level: LogLevels.Info, message: response.getMessages() });
          } else if (uniqueSubscriptions.length > 0) {
            loggerDoNotModifySubscription.logWithOptions({
              level: LogLevels.Info,
              message: response.getMessages(),
            });
          }
        });

        // Set the order to complete
        await WooCommerceCustomWrapper.setOrderCompleteById(order.getId());
        const updatedOrder = await WooCommerceCustomWrapper.getOrderById(order.getId());

        if (updatedOrder.isCompleted()) {
          loggerOrderStatus.logWithOptions({ request: req, level: LogLevels.Info, message: `Order '${updatedOrder.getId()}' set to 'Completed'` });
        } else {
          throw new Error(`Order '${orderId}' status is '${updatedOrder.getStatus()}'`);
        }


        return res.json({ messages: _.map(responses, response => { return response.getMessages(); }), order: 'Complete' });
      });
    }).catch(async err => {
      await BookshelfDashboard.transaction(async transacting => {
        const existingOrderTracker = await modelsDashboard.Order
          .forge()
          .where({
            woo_order_id: order.getId(),
            transaction_id: transactionId,
          })
          .fetch({
            columns: ['id', 'status'],
            transacting,
          });

        if (!existingOrderTracker) {
          return;
        }

        if (existingOrderTracker.get('status') === OrderTrackerStatus.Completed) {
          loggerOrderFailed.info({
            message: `Order tracker with already completed at id: ${existingOrderTracker.get('id')}`,
            request: req,
            error: err,
          });
          return;
        }

        loggerOrderFailed.logWithOptions({ request: req, error: err });
        await existingOrderTracker.save({ status: OrderTrackerStatus.Failed }, { transacting, patch: true });
      });

      loggerWooOrderError.logWithOptions({ request: req, error: err });

      console.log(err);
      return res.json({ message: 'Webhook resulted in error. See error log. Returning success status to avoid automatically cancelling the webhook.' });
    });
  }).catch(err => {
    loggerWooOrderError.logWithOptions({ request: req, error: err });

    console.log(err);
    return res.json({ message: 'Webhook resulted in error. See error log. Returning success status to avoid automatically cancelling the webhook.' });
  });
});

router.post('/woo-subscription', (req, res) => {
  return Promise.try(async () => {
    const subscriptionId = _.get(req, ['body', 'id']);
    const subscription = await WooCommerceCustomWrapper.getSubscriptionById(subscriptionId);
    const affiliate = subscription.getAffiliate();

    return Promise.try(async () => {
      const customer = await WooCommerceCustomWrapper.getCustomer(subscription.getCustomerId());

      if (affiliate) {
        await modelsDashboard.User.forge().where({
          email: customer.getEmail(),
        }).save({
          tapfiliate_referrer: affiliate,
        }, {
          method: 'update',
          patch: true,
        });
      }

      if (subscription.getId() === -1) {
        throw new Error(`Woo Subscription did not come with ID when queried at '${subscriptionId}'`);
      }

      return BookshelfDashboard.transaction(async transacting => {
      // Subscriptions must be created using orders, if the subscription does not already exist, stop.
        const BYPASS_ORDER_CHECK_BOOL_KEY = 'order_first_check_skip';
        const enforceOrderFirstCheck = _.get(req, ['body', BYPASS_ORDER_CHECK_BOOL_KEY], '').toLowerCase() !== 'true';
        if (enforceOrderFirstCheck) {
          await modelsDashboard.Subscription.forge().where({
            woo_subscription_id: subscription.getId(),
          }).count({
            transacting,
          }).then(count => {
            if (count < 1) {
              const message = `Subscriptions must be initialized using order creation. To bypass this, provide ${BYPASS_ORDER_CHECK_BOOL_KEY} set to 'true'.`;
              loggerSubscriptionCreationError.logWithOptions({ request: req, message });
              throw new Error(message);
            }
          });
        }

        const subscriptionUpdater = new SubscriptionUpdater({
          wooSubscription: subscription,
          email: customer.getEmail(),
          transacting,
          response: new SubscriptionResponse({ email: customer.getEmail() }),
        });

        return subscriptionUpdater.updateSubscriptions(req);
      });
    }).then(response => {
    // await response.sendAllDripEvents().catch(err => {
    //   loggerDripError.logWithOptions({ request: req, error: err });
    // });

      if (response.subscriptionsModified()) {
        loggerModifySubscription.logWithOptions({ request: req, level: LogLevels.Info, message: response.getMessages() });
      }

      return res.json({ messages: response.getMessages() });
    }).catch(err => {
      loggerWooSubscriptionError.logWithOptions({ request: req, error: err });

      console.log(err);
      return res.json({ message: 'Webhook resulted in error. See error log. Returning success status to avoid automatically cancelling the webhook.' });
    });
  }).catch(err => {
    loggerWooSubscriptionError.logWithOptions({ request: req, error: err });
    console.log(err);
    return res.json({ message: 'Webhook resulted in error. See error log. Returning success status to avoid automatically cancelling the webhook.' });
  });
});

// handle order.payment_succeeded stripe webhook
router.post('/stripe-order-payment-succeeded', (req, res, next) => {
  const object = _.get(req, ['body', 'data', 'object']);

  return Promise.try(() => {
    // Inform drip of order
    // DripIntegration.createOrder(object.email, {
    //   identifier: object.id,
    //   amount: object.amount,
    //   orderItems: object.items,
    // });

    const items = _.filter(object.items, item => { return item.type === 'sku'; });
    return BookshelfDashboard.transaction(transacting => {
      return Promise.map(items, item => {
        switch (item.parent) {
          case process.env.PREMIUM_SKU:
          case process.env.PREMIUM_PROMO_SKU:
          case process.env.PREMIUM_FULL_PRICE_SKU:
            return products.Pro.add(object.email, {
              transacting,
            });
          case process.env.FUNNEL_IGNITE_SKU:
            return products.Ignite.add(object.email, {
              transacting,
            });
          case process.env.BUMP_SKU:
            return products.Template.add(object.email, {
              transacting,
            });
          case process.env.VAULT_SKU:
          case process.env.VAULT_PROMO_SKU:
            return products.Vault.add(object.email, {
              transacting,
            });
          case process.env.PLUS_SKU:
            return products.Plus.add(object.email, {
              transacting,
            });
          default:
            return null;
        }
      });
    });
  })
    .then(() => {
      return res.json({
        success: true,
      });
    })
    .catch(err => { return next(err); });
});

// handle charge.succeeded stripe webhook
router.post('/stripe-order-charge-succeeded', (req, res, next) => {
  const object = _.get(req, ['body', 'data', 'object']);

  /**
   * We only directly handle charges that have products associated with them in metadata.
   */
  if (!_.has(object, 'metadata.products')) {
    return res.json({});
  }

  return Promise.try(() => {
    return BookshelfDashboard.transaction(transacting => {
      const cart = _.map(object.metadata.products.split(', '), product => { return product.toLowerCase(); });
      const promises = [];
      if (_.includes(cart, 'funnelytics pro')) {
        promises.push(
          products.Pro.add(object.metadata.email, {
            transacting,
          }),
        );
      }
      if (_.includes(cart, 'vault')) {
        promises.push(
          products.Vault.add(object.metadata.email, {
            transacting,
          }),
        );
      }
      if (_.includes(cart, 'funnel ignite')) {
        promises.push(
          products.Ignite.add(object.metadata.email, {
            transacting,
          }),
        );
      }
      if (_.includes(cart, 'agency ignite swipe files')) {
        promises.push(
          products.Template.add(object.metadata.email, {
            transacting,
          }),
        );
      }
      return Promise.all(promises);
    });
  })
    .then(() => {
      return res.json({
        success: true,
      });
    })
    .catch(err => { return next(err); });
});

router.post('/user-reached-request-limit', (req, res, next) => {
  const { workspaceId } = _.get(req, 'body');

  modelsDashboard.Project.forge()
    .where({ id: workspaceId })
    .fetch({
      withRelated: 'user',
    })
    .then(customerWorkspace => {
      const user = customerWorkspace.related('user');
      const customerName = `${user.get('first_name')} ${user.get('last_name')}`;

      return EmailHelper.send(
        'agajendran@funnelytics.io',
        'support@funnelytics.io',
        `Rate limit notification for ${customerName}`,
        [
          `<p>Customer <b>${user.get('email')} (${customerName})</b></p>`,
          `<p>has reached hourly requests limit for workspace: <b>${customerWorkspace.get('name')}</b></p>`,
          `<p>workspaceId: <b>${workspaceId}</b></p>`,
        ].join(''),
        [
          'alekcei.glazunov@gmail.com',
          'divanchenko@funnelytics.io',
          'cellefson@funnelytics.io',
        ],
      );
    }).then(() => {
      return res.json({ message: 'Email sent' });
    })
    .catch(error => {
      return next(error);
    });
});

module.exports = router;

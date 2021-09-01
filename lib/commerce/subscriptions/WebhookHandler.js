'use strict';

const _ = require('lodash');
const Promise = require('bluebird');
const {
  Assertion,
} = require('@funnelytics/utilities');
const {
  databases: {
    dashboard: BookshelfDashboard,
  },
  models: {
    dashboard: modelsDashboard,
  },
  users: {
    User,
  },
} = require('@funnelytics/shared-data');
const WebhookFailedToComplete = require('./errors/WebhookFailedToComplete');
const RecurlyWebhook = require('./recurly/webhooks/RecurlyWebhook');
const ProductsSKUManager = require('./sku/ProductsSKUManager');
const SubscriptionsSKUManager = require('./sku/SubscriptionsSKUManager');
const AddOnSKUManager = require('./sku/AddOnSKUManager');
const WebhookEngine = require('./webhook-engines/WebhookEngine');
const SKUMapping = require('./sku/SKUMapping');

const Subscription = require('./objects/Subscription');
const InvoicedUserLineItem = require('./objects/InvoicedUserLineItem');
const SlackIntegration = require('../../integrations/SlackIntegration');
const TapFiliateOrder = require('../third-party/affiliates/TapFiliateOrder');

const UpdateExternalServicesOptions = require('./options/post-webhook/UpdateExternalServicesOptions');
const ExternalServiceToUpdate = require('./options/post-webhook/update-external-services/ExternalServiceToUpdate');
const PostWebhookOptions = require('./options/PostWebhookOptions');

const ExternalServiceManager = require('./external-services/ExternalServiceManager');
const ExternalServiceConfig = require('./external-services/config/ExternalServiceConfig');

const EventSender = require('../../integrations/EventSender');
const NullEventSenderEngine = require('../../integrations/event-sender/event-sender-engines/NullEventSenderEngine');

const SubscriptionUpdatedResponse = require('./objects/SubscriptionUpdatedResponse');

const LineItemTypeConstants = require('./constants/LineItemTypeConstants');
const HandledWebhookConstants = require('./constants/HandledWebhookConstants');
const ExternalServiceTableConstants = require('./external-services/constants/ExternalServiceTableConstants');
const ExternalServiceStatusConstants = require('./external-services/constants/ExternalServiceStatusConstants');
const ExternalServiceTypeConstants = require('./external-services/constants/ExternalServiceTypeConstants');
const SubscriptionModificationConstants = require('./constants/SubscriptionModificationConstants');
const SubscriptionConstants = require('./constants/SubscriptionConstants');
const PermissionConflict = require('../../account/PermissionConflict');
const PermissionConflictConstants = require('../../account/permission-conflict/PermissionConflictConstants');
const tracker = require('../../analytics/tracker');


class WebhookHandler {
  constructor({
    webhookEngine,
    SubscriptionManagerEngineClass,
  } = {}) {
    this.setWebhookEngine(webhookEngine);
    this.setSubscriptionManagerEngineClass(SubscriptionManagerEngineClass);
  }

  static handlePostWebhookActions(postWebhookOptions) {
    return Promise.try(() => {
      Assertion.instanceOf(postWebhookOptions, PostWebhookOptions);

      return Promise.all([
        Promise.try(() => {
          if (!postWebhookOptions.hasUpdateExternalServicesOptions()) {
            return null;
          }

          const type = postWebhookOptions.getExternalServiceType();
          const manager = new ExternalServiceManager(ExternalServiceConfig.createFromType(type));

          return Promise.mapSeries(postWebhookOptions.getExternalServicesToUpdate(), externalServiceToUpdate => {
            return manager.updateExternalService(externalServiceToUpdate);
          });
        }),
        Promise.try(() => {
          if (!postWebhookOptions.hasInvoice()) {
            return null;
          }

          return TapFiliateOrder.handleInvoice(postWebhookOptions.getInvoice());
        }),
        Promise.try(async () => {
          if (!postWebhookOptions.getUserId()) {
            return Promise.resolve(false);
          }

          const userRecord = await modelsDashboard.User.forge().where({
            id: postWebhookOptions.getUserId(),
          }).fetch({
            columns: ['email'],
            softDelete: false,
          });

          if (!userRecord) {
            SlackIntegration.reportMissingUser({
              type: 'Unknown', // not good
              elementLabel: 'post-webhook handler.',
              userId: postWebhookOptions.getUserId(),
            });
            return null;
          }

          return postWebhookOptions.sendEvents(userRecord.get('email'));
        }),
      ]);
    });
  }

  handleWebhook() {
    let userId;
    let wasInConflict = false; // stores whether user permissions were in conflict prior to webhook handling
    const postWebhookOptions = new PostWebhookOptions({
      eventSender: new EventSender({
        eventSenderEngine: new NullEventSenderEngine(),
      }),
    });

    return Promise.try(() => {
      return BookshelfDashboard.transaction(transacting => {
        return Promise.try(() => {
          switch (this.getWebhookType()) {
            case HandledWebhookConstants.PAID_INVOICE:
              return this.getWebhookEngine().getInvoiceAsync().then(async invoice => {
                userId = invoice.getUserId();

                tracker.trackOrderCompleted(userId, invoice);

                wasInConflict = await PermissionConflict.isInConflictAsync({
                  userId,
                  permissions: PermissionConflictConstants.PERMISSIONS_SESSIONS,
                  transacting,
                });

                return this.invoiceHandler(transacting).then(confirmedInvoice => {
                  postWebhookOptions.setInvoice(confirmedInvoice);
                  return this.productHandler({
                    transacting,
                    postWebhookOptions,
                  });
                });
              });
            case HandledWebhookConstants.NEW_SUBSCRIPTION:
            case HandledWebhookConstants.CANCELED_SUBSCRIPTION:
            case HandledWebhookConstants.RENEWED_SUBSCRIPTION:
            case HandledWebhookConstants.EXPIRED_SUBSCRIPTION:
            case HandledWebhookConstants.UPDATED_SUBSCRIPTION:
            case HandledWebhookConstants.REACTIVATED_SUBSCRIPTION:
              return this.getWebhookEngine().getSubscriptionAsync().then(async subscription => {
                userId = subscription.getUserId();
                const { isInConflict } = await Promise.props({
                  isInConflict: await PermissionConflict.isInConflictAsync({
                    userId,
                    permissions: PermissionConflictConstants.PERMISSIONS_SESSIONS,
                    transacting,
                  }),
                });

                wasInConflict = isInConflict;

                return this.handleSubscription({
                  transacting,
                  postWebhookOptions,
                });
              });
            default:
              return false;
          }
        });
      }).then(() => {
        if (!userId) {
          return null;
        }

        return BookshelfDashboard.transaction(transacting => {
          return Promise.all([
            PermissionConflict.announceConflictChange({
              userId,
              permissions: PermissionConflictConstants.PERMISSIONS_SESSIONS,
              previousState: wasInConflict,
              transacting,
            }),
          ]);
        });
      }).then(() => {
        return postWebhookOptions;
      });
    });
  }

  invoiceHandler(transacting) {
    return Promise.try(async () => {
      Assertion.transacting(transacting);

      const invoice = await this.getWebhookEngine().getInvoiceAsync();
      const userRecord = modelsDashboard.User.forge().where({
        id: invoice.getUserId(),
      }).fetch({
        transacting,
        columns: ['id'],
      });

      if (!userRecord) {
        SlackIntegration.reportMissingUser({
          type: this.getWebhookType(),
          elementLabel: `Invoice with ID ${invoice.getExternalId()}`,
          userId: invoice.getUserId(),
        });
        throw new WebhookFailedToComplete();
      }

      return this.getWebhookEngine().storeInvoice(transacting).then(async storedInvoiceId => {
        const SKUSetups = [];
        const productSkuManager = new ProductsSKUManager({
          transacting,
        });
        if (invoice.hasProducts()) {
          SKUSetups.push(productSkuManager.fetchAllSKUs());
        }
        const subscriptionsSKUManager = new SubscriptionsSKUManager({
          transacting,
        });
        if (invoice.hasSubscriptions()) {
          SKUSetups.push(subscriptionsSKUManager.fetchAllSKUs());
        }
        const addOnSKUManager = new AddOnSKUManager({
          transacting,
        });
        if (invoice.hasAddOnAdjustments()) {
          SKUSetups.push(addOnSKUManager.fetchAllSKUs());
        }


        await Promise.all(SKUSetups);

        return Promise.all(_.concat(
          invoice.getProductAdjustments().map(lineItem => {
            return this.getWebhookEngine().storeLineItem({
              invoiceId: storedInvoiceId,
              lineItem,
              skuManager: productSkuManager,
              transacting,
              type: LineItemTypeConstants.TYPE_PRODUCT,
            });
          }),
          invoice.getSubscriptionAdjustments().map(lineItem => {
            return this.getWebhookEngine().storeLineItem({
              invoiceId: storedInvoiceId,
              lineItem,
              skuManager: subscriptionsSKUManager,
              transacting,
              type: LineItemTypeConstants.TYPE_SUBSCRIPTION,
            });
          }),
          invoice.getAddOnAdjustments().map(lineItem => {
            return this.getWebhookEngine().storeLineItem({
              invoiceId: storedInvoiceId,
              lineItem,
              skuManager: addOnSKUManager,
              transacting,
              type: LineItemTypeConstants.TYPE_ADD_ON,
            });
          }),
        )).then(() => {
          return invoice;
        });
      });
    });
  }

  productHandler({
    transacting,
    postWebhookOptions,
  }) {
    return Promise.try(async () => {
      Assertion.instanceOf(postWebhookOptions, PostWebhookOptions);
      Assertion.transacting(transacting);

      const productSkuManager = new ProductsSKUManager({
        transacting,
      });

      await productSkuManager.fetchAllSKUs();

      const invoice = await this.getWebhookEngine().getInvoiceAsync();

      postWebhookOptions.setUserId(invoice.getUserId());

      const userLineItems = invoice.getProductAdjustments().filter(product => {
        return productSkuManager.hasMappingForSKU(product.getSKU());
      }).map(product => {
        return new InvoicedUserLineItem({
          userId: invoice.getUserId(),
          externalId: product.getExternalId(),
          productId: productSkuManager.getTargetIdBySKU(product.getSKU()),
        });
      });

      const [invoicedUserProducts, userRecord] = await Promise.all([
        this.getWebhookEngine().getInvoiceItemIdsForLineItems({
          invoicedUserLineItems: userLineItems,
          transacting,
        }),
        modelsDashboard.User.forge().where({
          id: invoice.getUserId(),
        }).fetch({
          transacting,
          columns: ['id', 'tapfiliate_referrer'],
        }),
      ]);

      if (!userRecord) {
        SlackIntegration.reportMissingUser({
          type: this.getWebhookType(),
          elementLabel: `Invoice with Recurly ID ${invoice.getExternalId()}`,
          userId: invoice.getUserId(),
        });
        throw new WebhookFailedToComplete();
      }

      return Promise.map(invoicedUserProducts, async invoicedProduct => {
        const [previouslyAddedUserProduct, product] = await Promise.all([
          modelsDashboard.UserProduct.forge().where({
            user: invoice.getUserId(),
            product: invoicedProduct.getProductId(),
            invoice_item: invoicedProduct.getInvoiceItemId(),
          }).fetch({
            transacting,
            columns: [
              'id',
              'product',
              ExternalServiceTableConstants.EXTERNAL_STATUS_COLUMN,
            ],
          }),
          modelsDashboard.Product.forge().where({
            id: invoicedProduct.getProductId(),
          }).fetch({
            transacting,
            columns: ['name', ExternalServiceTableConstants.EXTERNAL_ACTION_REQUIRED_COLUMN],
          }),
        ]);

        if (previouslyAddedUserProduct) {
          return previouslyAddedUserProduct;
        }

        return modelsDashboard.UserProduct.forge().save({
          user: invoice.getUserId(),
          product: invoicedProduct.getProductId(),
          invoice_item: invoicedProduct.getInvoiceItemId(),
          tapfiliate_referrer: userRecord.get('tapfiliate_referrer'),
          external_status: product.get(ExternalServiceTableConstants.EXTERNAL_ACTION_REQUIRED_COLUMN)
            ? ExternalServiceStatusConstants.ACTION_REQUIRED
            : null,
        }, {
          transacting,
          returning: [
            'id',
            'product',
            ExternalServiceTableConstants.EXTERNAL_STATUS_COLUMN,
          ],
        }).then(newUserProduct => {
          postWebhookOptions.addEvent(`Purchased ${product.get('name')} Product`);

          return newUserProduct;
        });
      }).then(productsAffected => {
        const externalServicesToUpdate = productsAffected.filter(userProduct => {
          return !_.isEmpty(userProduct);
        }).filter(userProduct => {
          const externalActionStatus = userProduct.get(ExternalServiceTableConstants.EXTERNAL_STATUS_COLUMN);
          return externalActionStatus === ExternalServiceStatusConstants.ACTION_REQUIRED;
        }).map(userProduct => {
          return new ExternalServiceToUpdate({
            serviceId: userProduct.get('product'),
            recordId: userProduct.get('id'),
            userId: invoice.getUserId(),
            activating: true,
          });
        });

        const options = new UpdateExternalServicesOptions({
          externalServiceType: ExternalServiceTypeConstants.PRODUCTS,
          externalServicesToUpdate,
        });

        return postWebhookOptions.setUpdateExternalServicesOptions(options);
      });
    });
  }

  handleSubscription({
    transacting,
    postWebhookOptions,
  }) {
    return Promise.try(async () => {
      Assertion.instanceOf(postWebhookOptions, PostWebhookOptions);
      Assertion.transacting(transacting);
      const subscription = await this.getWebhookEngine().getSubscriptionAsync();
      postWebhookOptions.setUserId(subscription.getUserId());

      const existingUserSubscription = await this.getWebhookEngine().getUserSubscriptionRecordAsync({
        externalId: subscription.getExternalId(),
        transacting,
      });

      const subscriptionHandler = existingUserSubscription
        ? this.updateSubscription({
          transacting,
          previousStatus: existingUserSubscription.get('status'),
        })
        : this.createNewSubscription({ transacting });

      return subscriptionHandler.then(subscriptionUpdatedResponse => {
        if (subscriptionUpdatedResponse.hasModification()) {
          const name = subscriptionUpdatedResponse.getName();
          const modification = subscriptionUpdatedResponse.getModification();
          postWebhookOptions.addEvent(`${modification} ${name} Subscription`);
        }

        return this.getSubscriptionExternalOptions({
          userSubscription: subscriptionUpdatedResponse.getUserSubscription(),
          postWebhookOptions,
        });
      });
    });
  }

  createNewSubscription({
    transacting,
  }) {
    return Promise.try(async () => {
      Assertion.transacting(transacting);
      const subscription = await this.getWebhookEngine().getSubscriptionAsync();
      let userSubscription;

      const [userRecord, skuMapping, addOnSkuMappings] = await Promise.all([
        modelsDashboard.User.forge().where({
          id: subscription.getUserId(),
        }).fetch({
          transacting,
          columns: ['id', 'tapfiliate_referrer'],
        }),
        this.getSubscriptionSkuMapping(subscription, transacting),
        this.getAddOnSkuMappings(subscription, transacting),
      ]);

      const subscriptionRecord = await this.getWebhookEngine().getSubscriptionRecordAsync({
        subscriptionId: skuMapping.getTargetId(),
        transacting,
      });

      if (subscriptionRecord.get(ExternalServiceTableConstants.EXTERNAL_ACTION_REQUIRED_COLUMN)) {
        subscription.setExternalStatus(ExternalServiceStatusConstants.ACTION_REQUIRED);
      }

      if (!userRecord) {
        SlackIntegration.reportMissingUser({
          type: this.getWebhookType(),
          elementLabel: `Subscription with Recurly ID ${subscription.getExternalId()}`,
          userId: subscription.getUserId(),
        });
        throw new WebhookFailedToComplete();
      }

      subscription.setSubscriptionRecordId(skuMapping.getTargetId());
      subscription.getAddOns().forEach(addOn => {
        const addOnSkuMapping = addOnSkuMappings.find(mapping => {
          return mapping.getSKU() === addOn.getCode();
        });

        addOn.setAddOnRecordId(addOnSkuMapping.getTargetId());
      });
      subscription.setAffiliateCode(userRecord.get('tapfiliate_referrer'));

      await Promise.all([
        this.getWebhookEngine().storeUserSubscription({
          subscription,
          transacting,
        }),
        Promise.try(() => {
          // TODO: might be good to do this using the permission checker at the end of routes that use this
          // TODO: to keep things consistent!
          if (subscription.getSKU().slice(0, 4) === 'pro_') {
            const user = new User(subscription.getUserId());

            return Promise.all([
              BookshelfDashboard.knex.raw(
                `
                  DELETE FROM analytics_ranges
                  WHERE "start_datetime" IS NOT NULL
                  AND "end_datetime" IS NULL
                  AND "user" = ?;
                `,
                [
                  subscription.getUserId(),
                ],
              ).transacting(transacting),
              user.setMeta('allowed_project_tracking', true, {
                transacting,
              }),
              user.setMeta('received_downgrade_notice', false, {
                transacting,
              }),
              modelsDashboard.Project.forge().where({
                user: subscription.getUserId(),
              }).save({
                tracking: true,
              }, {
                method: 'UPDATE',
                require: false,
              }),
            ]);
          }
          return null;
        }),
      ]).then(result => {
        [
          userSubscription,
        ] = result;

        return userSubscription;
      });

      return new SubscriptionUpdatedResponse({
        userSubscription,
        name: subscriptionRecord.get('name'),
        modification: SubscriptionModificationConstants.ENABLED,
      });
    });
  }

  updateSubscription({
    transacting,
    previousStatus,
  }) {
    return Promise.try(async () => {
      Assertion.transacting(transacting);
      Assertion.string(previousStatus);

      const subscription = await this.getWebhookEngine().getSubscriptionAsync();

      const [
        skuMapping,
        addOnSkuMappings,
      ] = await Promise.all([
        this.getSubscriptionSkuMapping(subscription, transacting),
        this.getAddOnSkuMappings(subscription, transacting),
      ]);

      subscription.setSubscriptionRecordId(skuMapping.getTargetId());
      subscription.getAddOns().forEach(addOn => {
        const addOnSkuMapping = addOnSkuMappings.find(mapping => {
          return mapping.getSKU() === addOn.getCode();
        });

        addOn.setAddOnRecordId(addOnSkuMapping.getTargetId());
      });

      const userSubscription = await this.getWebhookEngine().storeUpdatedUserSubscription({
        subscription,
        transacting,
      });

      let modification = null;
      if (previousStatus !== userSubscription.get('status')) {
        switch (userSubscription.get('status')) {
          case SubscriptionConstants.STATUS_ACTIVE:
            modification = SubscriptionModificationConstants.ENABLED;
            break;
          case SubscriptionConstants.STATUS_CANCELLING:
            modification = SubscriptionModificationConstants.PENDING_CANCELLATION;
            break;
          case SubscriptionConstants.STATUS_INACTIVE:
            modification = SubscriptionModificationConstants.TERMINATED;
            break;
          default:
            modification = null;
        }
      }

      const subscriptionRecord = await this.getWebhookEngine().getSubscriptionRecordAsync({
        subscriptionId: userSubscription.get('subscription'),
        transacting,
      });

      return new SubscriptionUpdatedResponse({
        userSubscription,
        modification,
        name: subscriptionRecord.get('name'),
      });
    });
  }

  async getSubscriptionExternalOptions({
    userSubscription,
    postWebhookOptions,
  }) {
    return Promise.try(() => {
      Assertion.instanceOf(postWebhookOptions, PostWebhookOptions);

      if (!userSubscription) {
        return null;
      }

      const externalSubscriptionStatus = userSubscription.get(ExternalServiceTableConstants.EXTERNAL_STATUS_COLUMN);
      if (externalSubscriptionStatus === null) {
        return null;
      }

      const subscriptionStatus = userSubscription.get('status');
      const subscriptionIsActive = Subscription.isStatusActive(subscriptionStatus);

      const externalStatusIsInSync = subscriptionIsActive
        ? externalSubscriptionStatus === ExternalServiceStatusConstants.ACTIVATED
        : externalSubscriptionStatus === ExternalServiceStatusConstants.TERMINATED;

      if (externalStatusIsInSync) {
        return null;
      }

      postWebhookOptions.setUpdateExternalServicesOptions(new UpdateExternalServicesOptions({
        externalServiceType: ExternalServiceTypeConstants.SUBSCRIPTIONS,
        updateExternalServiceOptions: [
          new ExternalServiceToUpdate({
            serviceId: userSubscription.get('subscription'),
            recordId: userSubscription.get('id'),
            userId: userSubscription.get('user'),
            activating: subscriptionIsActive,
          }),
        ],
      }));

      return postWebhookOptions;
    });
  }

  getSubscriptionSkuMapping(subscription, transacting) {
    return Promise.try(async () => {
      Assertion.instanceOf(subscription, Subscription);
      Assertion.transacting(transacting);
      const subscriptionsSKUManager = new SubscriptionsSKUManager({
        transacting,
      });

      const skuMapping = await subscriptionsSKUManager.fetchOne(subscription.getSKU());
      if (!skuMapping) {
        SlackIntegration.reportMissingSubscriptionSKU({
          type: this.getWebhookType(),
          elementLabel: `Subscription with Recurly ID ${subscription.getExternalId()}`,
          SKU: subscription.getSKU(),
        });
        throw new WebhookFailedToComplete();
      }
      return skuMapping;
    });
  }

  getAddOnSkuMappings(subscription, transacting) {
    return Promise.try(async () => {
      Assertion.instanceOf(subscription, Subscription);
      Assertion.transacting(transacting);
      const addOnSKUManager = new AddOnSKUManager({
        transacting,
      });
      if (!subscription.hasAddOns()) {
        return [];
      }

      const uniqueAddOnCodes = _.uniq(subscription.getAddOns().map(addOn => {
        return addOn.getCode();
      }));

      const skuMappings = await Promise.map(uniqueAddOnCodes, addOnCode => {
        return addOnSKUManager.fetchOne(addOnCode);
      });

      const validSkuMappings = skuMappings.filter(mapping => {
        return mapping instanceof SKUMapping;
      });

      if (validSkuMappings.length !== uniqueAddOnCodes.length) {
        SlackIntegration.reportMissingAddOnSKU({
          type: this.getWebhookType(),
          elementLabel: `Subscription with Recurly ID ${subscription.getExternalId()}`,
          requiredSKUs: uniqueAddOnCodes,
        });
        throw new WebhookFailedToComplete();
      }

      return validSkuMappings;
    });
  }

  getWebhookEngine() {
    return this._webhookEngine;
  }

  getWebhookType() {
    return this.getWebhookEngine().getWebhookType();
  }

  getSubscriptionManagerEngineClass() {
    return this._subscriptionManagerEngineClass;
  }

  setWebhookEngine(webhookEngine) {
    Assertion.instanceOf(webhookEngine, WebhookEngine);

    this._webhookEngine = webhookEngine;
  }

  setSubscriptionManagerEngineClass(SubscriptionManagerEngineClass) {
    this._subscriptionManagerEngineClass = SubscriptionManagerEngineClass;
  }

  static reportUnrecognizedErrors(err, webhookBody) {
    if (!(err instanceof WebhookFailedToComplete)) {
      let errorMessage = _.get(err, ['data', 'error', 'description']);
      if (!errorMessage) {
        errorMessage = _.get(err, ['message']);
      }
      if (!errorMessage) {
        errorMessage = _.get(err, ['name']);
      }
      if (!errorMessage) {
        errorMessage = 'No Message';
      }
      try {
        const webhook = new RecurlyWebhook(webhookBody);
        // eslint-disable-next-line no-console
        console.log(err);
        SlackIntegration.notifyForWebhook({
          type: webhook.getType(),
          message: errorMessage,
          icon: ':interrobang:',
        });
      } catch (secondError) {
        // eslint-disable-next-line no-console
        console.log(secondError);
        SlackIntegration.notifyForWebhook({
          type: 'unknown',
          message: errorMessage,
          icon: ':interrobang:',
        });
      }
    }
  }
}

module.exports = WebhookHandler;

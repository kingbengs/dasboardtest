'use strict';

const express = require('express');
const Promise = require('bluebird');
const request = require('request-promise');
const Joi = require('@hapi/joi');
const _ = require('lodash');
const crypto = require('crypto');
const {
  errors,
  models: {
    dashboard: modelsDashboard,
  },
  databases: {
    dashboard: BookshelfDashboard,
  },
  uuid: {
    SubscriptionIdentifier,
  },
} = require('@funnelytics/shared-data');

const router = express.Router();
const RecurlyWrapper = require('../lib/commerce/subscriptions/recurly/RecurlyWrapper');
const SubscriptionsManager = require('../lib/commerce/subscriptions/SubscriptionsManager');
const RecurlyManagerEngine = require('../lib/commerce/subscriptions/manager-engines/RecurlyManagerEngine');
const WebhookHandler = require('../lib/commerce/subscriptions/WebhookHandler');
const PurchaseInfo = require('../lib/commerce/PurchaseInfo');
const ProductAssociator = require('../lib/commerce/ProductAssociator');
const UserCreator = require('../lib/users/UserCreator');
const ExternalServiceTableConstants = require('../lib/commerce/subscriptions/external-services/constants/ExternalServiceTableConstants');
const ExternalServiceStatusConstants = require('../lib/commerce/subscriptions/external-services/constants/ExternalServiceStatusConstants');
const EmailTemplateConstants = require('../lib/emails/EmailTemplateConstants');
const EmailHelper = require('../lib/emails/EmailHelper');
const PermissionConflict = require('../lib/account/PermissionConflict');
const PermissionConflictConstants = require('../lib/account/permission-conflict/PermissionConflictConstants');
const PermissionEnforcer = require('../lib/account/PermissionEnforcer');
const {
  WorkspacesSubsciptionPurchasePreventer,
} = require('../lib/account/permission-enforcer/permission-enforcer-configs');
const AccountConstants = require('../lib/account/AccountConstants');

const randomBytes = Promise.promisify(crypto.randomBytes);
const TRACK_100K = 'pro_100k';
const TRACK_500K = 'pro_500k';

router.post('/external', (req, res, next) => {
  let userId;
  let wasInConflict = false; // stores whether user permissions were in conflict prior to purchase
  return Promise.try(() => {
    const auth = _.replace(_.get(req, ['headers', 'authorization']), 'Basic ', '');
    if (!auth) {
      throw errors.predefined.generic.forbidden;
    }
    const bufferedAuth = Buffer.from(auth, 'base64');
    const decodedAuth = bufferedAuth.toString('utf-8');
    const [username, password] = decodedAuth.split(':');
    if (username !== process.env.CLICKFUNNELS_USER || password !== process.env.CLICKFUNNELS_PASSWORD) {
      throw errors.predefined.generic.forbidden;
    }

    return Promise.try(() => {
      return Joi.object().keys({
        email: Joi.string()
          .email({
            minDomainSegments: 2,
          })
          .insensitive()
          .lowercase()
          .required(),
        firstName: Joi.string().required(),
        lastName: Joi.string().allow('', null).default(''),
        productSku: Joi.string()
          .valid(TRACK_100K, TRACK_500K)
          .required(),
      }).validateAsync(req.body, {
        stripUnknown: true,
      });
    }).catch(err => {
      throw errors.fromJoi(err);
    });
  }).then(({
    email,
    productSku,
    firstName,
    lastName,
  }) => {
    return BookshelfDashboard.transaction(async transacting => {
      //* For now we only support 1 product here.
      const allProductSkus = [productSku];
      //* Using this in case we later start using the associator more aggressively, for now this is
      //* just here to lay some ground work!
      const associator = new ProductAssociator({
        productSKUs: allProductSkus,
        transacting,
      });

      await associator.associate();

      // Find the ID of the product that we are planning to add based on the sku provided
      const skus = await modelsDashboard.ProductSku.forge().query(qb => {
        qb.whereIn('sku', associator.getProductSKUs());
      }).fetchAll({
        columns: [
          'product',
          'sku',
        ],
        transacting,
      });
      if (associator.getProductSKUs().length !== skus.length) {
        throw new Error(`Could not find products in the database for all SKUs provided: ${allProductSkus.join(', ')}`);
      }

      // See if there is a user that already exists with this email
      let user = await modelsDashboard.User.forge().where({
        email,
      }).fetch({
        columns: [
          'id',
          'email',
        ],
        transacting,
      });

      const isNewUser = !user;
      let password;
      if (isNewUser) {
        // If there is no user, create one, generate a temporary password and remember that we have to give them a special welcome email
        const passwordBuffer = await randomBytes(20);
        password = passwordBuffer.toString('base64');
        const userCreator = new UserCreator({
          email,
          first_name: firstName,
          last_name: lastName,
          password,
        });
        user = await userCreator.create({
          transacting,
        }, true);
      }

      userId = user.get('id');
      wasInConflict = await PermissionConflict.isInConflictAsync({
        userId,
        permissions: PermissionConflictConstants.PERMISSIONS_SESSIONS,
        transacting,
      });

      /**
       * Give the user, existing or new, access to the products identified by productIds
       ** Only properly supports 1 product at this time.
       */
      return Promise.map(skus, async sku => {
        const productId = sku.get('product');
        const product = await modelsDashboard.Product.forge().where('id', productId).fetch({
          transacting,
          returning: [
            'id',
            ExternalServiceTableConstants.EXTERNAL_ACTION_REQUIRED_COLUMN,
          ],
        });

        await modelsDashboard.UserProduct.forge().save({
          user: user.get('id'),
          product: productId,
          external_status: product.get(ExternalServiceTableConstants.EXTERNAL_ACTION_REQUIRED_COLUMN)
            ? ExternalServiceStatusConstants.ACTION_REQUIRED
            : null,
        }, {
          transacting,
        });

        // Send an email to the user informing them about their new account (if applicable) and the product they just bought
        let sessionsAllowed = '0';
        const skuString = sku.get('sku');
        if (skuString === TRACK_500K) {
          sessionsAllowed = '500,000';
        } else if (skuString === TRACK_100K) {
          sessionsAllowed = '100,000';
        } else {
          throw new Error(`We are not able to handle the sku ${skuString}`);
        }
        const templateId = isNewUser
          ? EmailTemplateConstants.PRO_SESSIONS_PURCHASE_NEW
          : EmailTemplateConstants.PRO_SESSIONS_PURCHASE_EXISTING;

        await EmailHelper.sendTemplate(
          email,
          'noresponse@funnelytics.io',
          'Your Funnelytics Pro Sessions Product!',
          templateId,
          {
            firstName,
            lastName,
            email,
            password,
            sessionsAllowed,
          },
        );

        return {
          email,
          productSku,
          firstName,
          lastName,
        };
      });
    });
  }).then(details => {
    res.json({
      message: 'Success',
    });

    request({
      method: 'POST',
      url: 'https://hooks.zapier.com/hooks/catch/913854/o182zb6/',
      json: true,
      body: _.extend(details[0], {
        limit: parseInt((details[0].productSku || '').slice(4, 7), 10),
      }),
    });

    return null;
  }).then(async () => {
    if (!userId) {
      return null;
    }

    return BookshelfDashboard.transaction(transacting => {
      return PermissionConflict.announceConflictChange({
        userId,
        permissions: PermissionConflictConstants.PERMISSIONS_SESSIONS,
        previousState: wasInConflict,
        transacting,
      });
    });
  }).catch(next);
});

// GET /information
router.get('/information', (req, res, next) => {
  return Promise.try(async () => {
    const purchaseInfo = new PurchaseInfo({
      commaSplitPlanCodes: _.get(req, ['query', 'plans'], ''),
      commaSplitProductCodes: _.get(req, ['query', 'products'], ''),
      commaSplitAddonCodes: _.get(req, 'query.add_ons', ''),
    });

    return BookshelfDashboard.knex.transaction(transacting => {
      return Promise.props({
        planInformation: purchaseInfo.fetchPlanInformation(transacting),
        productInformation: purchaseInfo.fetchProductInformation(transacting),
        addonInformation: purchaseInfo.getAddonInformation(transacting),
      });
    }).then(({
      planInformation,
      productInformation,
      addonInformation,
    }) => {
      return res.json({
        plans: planInformation,
        products: productInformation,
        addons: addonInformation,
      });
    });
  }).catch(next);
});

// POST /create
router.post(['/', '/create'], (req, res, next) => {
  return Promise.try(async () => {
    const SKU_KEY = 'sku';
    const ADD_ONS_KEY = 'add_ons';
    const QUANTITY_KEY = 'quantity';

    const userAdminQueryResults = await BookshelfDashboard.knex.raw(
      `
        SELECT
          u.role
        FROM users u
        WHERE u.id = ?
      `,
      [
        req.user.id,
      ],
    );
    const isAdmin = parseInt(_.get(userAdminQueryResults, 'rows.0.role', 0), 10) >= 4;
    const validated = await Promise.try(() => {
      const purchaseValidation = Joi.object().keys({
        user: Joi.string().uuid({
          version: ['uuidv4'],
        }),
        purchases: Joi.object().keys({
          subscriptions: Joi.array().items(
            Joi.object().keys({
              [SKU_KEY]: Joi.string().min(1).required(),
              [ADD_ONS_KEY]: Joi.array().items(
                Joi.object().keys({
                  [SKU_KEY]: Joi.string().min(1).required(),
                  [QUANTITY_KEY]: Joi.number().integer().min(1).default(1),
                }),
              ).default([]),
            }),
          ).default([]),
          products: Joi.array().items(
            Joi.object().keys({
              [SKU_KEY]: Joi.string().min(1).required(),
            }),
          ).default([]),
          adjustments: isAdmin ? Joi.array().items(
            Joi.object().keys({
              description: Joi.string(),
              unit_amount_in_cents: Joi.number(),
              quantity: Joi.number().default(1),
              revenue_schedule_type: Joi.string().default('at_invoice'),
            }),
          ).default([]) : Joi.array().max(0).default([]),
        }).default({
          subscriptions: [],
          products: [],
          adjustments: [],
        }),
      });
      const purchaseData = _.extend(req.body, {
        user: isAdmin ? (req.body.user || req.user.id) : req.user.id,
      });

      return purchaseValidation.validateAsync(purchaseData, {
        stripUnknown: true,
      });
    }).catch(err => {
      throw errors.fromJoi(err);
    });

    let wasInConflict = false; // stores whether user permissions were in conflict prior to purchase
    const userId = validated.user;
    const mutuallyExclusiveSubscriptionIds = [
      SubscriptionIdentifier.PREMIUM,

      SubscriptionIdentifier.PREMIUM_1_PROJECT,
      SubscriptionIdentifier.PREMIUM_2_PROJECTS,
      SubscriptionIdentifier.PREMIUM_10_PROJECTS,
      SubscriptionIdentifier.PREMIUM_20_PROJECTS,

      SubscriptionIdentifier.MEASURE_10K,
      SubscriptionIdentifier.MEASURE_10K_TO_25K,
      SubscriptionIdentifier.MEASURE_25K_TO_50K,
      SubscriptionIdentifier.MEASURE_50K_TO_100K,
      SubscriptionIdentifier.MEASURE_100K_TO_250K,
      SubscriptionIdentifier.MEASURE_250K_TO_500K,
      SubscriptionIdentifier.MEASURE_500K_TO_1M,

      SubscriptionIdentifier.MARKETER_1_PROJECT,
      SubscriptionIdentifier.MARKETER_1_PROJECT_W_CHAT,

      SubscriptionIdentifier.PRO_MONTHLY,
    ];

    const {
      purchases: {
        subscriptions,
        products,
      },
    } = validated;

    const subscriptionSKUs = subscriptions.map(subscription => {
      return _.get(subscription, [SKU_KEY]);
    });
    const productSKUs = products.map(product => {
      return _.get(product, [SKU_KEY]);
    });

    let subscriptionsToRemove;
    let isCancellingExisting = false;
    return Promise.try(async () => {
      return BookshelfDashboard.transaction(async transacting => {
        wasInConflict = await PermissionConflict.isInConflictAsync({
          userId,
          permissions: PermissionConflictConstants.PERMISSIONS_SESSIONS,
          transacting,
        });

        subscriptionsToRemove = modelsDashboard.RecurlyUserSubscription.forge().where(qb => {
          qb.where('user', userId);
          qb.whereIn('subscription', mutuallyExclusiveSubscriptionIds);
          qb.whereIn('status', [
            'active',
            'cancelling',
          ]);
        }).fetchAll({
          columns: ['external_id'],
          transacting,
        });

        const associator = new ProductAssociator({
          productSKUs,
          subscriptionSKUs,
          transacting,
        });

        await associator.associate();

        const workspacesSubscriptionPurchasePreventer = new PermissionEnforcer({ config: WorkspacesSubsciptionPurchasePreventer });
        workspacesSubscriptionPurchasePreventer.setUserId(userId);
        const subscriptionSKUsToPurchase = await workspacesSubscriptionPurchasePreventer.enforce({
          [AccountConstants.SUBSCRIPTION_SKUS_TO_PURCHASE]: associator.getSubscriptionSKUs(),
          transacting,
        });

        // TODO: We will likely want to do something for this with the associator later to avoid such ad hoc handling of things, but for
        // TODO: now this is the only place where we're doing something like this:
        const subscriptionsToPurchase = subscriptionSKUsToPurchase.map(sku => {
          const subscriptionObject = {
            [SKU_KEY]: sku,
            [ADD_ONS_KEY]: [],
          };

          // Reset the subscription add ons for the purchase based on the skus they came in with
          if (subscriptionSKUs.includes(sku)) {
            const originalSubscriptionObject = _.find(subscriptions, subscription => {
              return sku === _.get(subscription, [SKU_KEY]);
            });
            const originalAddOns = _.get(originalSubscriptionObject, [ADD_ONS_KEY], []);
            _.set(subscriptionObject, [ADD_ONS_KEY], originalAddOns);
          }

          return subscriptionObject;
        });

        return Promise.props({
          adjustments: Promise.map(associator.getProductSKUs(), product => {
            return modelsDashboard.ProductSku.forge().where({
              sku: product,
            }).fetch({
              columns: [
                'price_in_cents',
                'default_description',
              ],
            }).then(sku => {
              if (!sku) {
                throw new Error(`Did not find a product with an SKU of ${product}.`);
              }
              
              return {
                product_code: product,
                quantity: 1,
                revenue_schedule_type: 'at_invoice',
                unit_amount_in_cents: sku.get('price_in_cents'),
                description: sku.get('default_description'),
              };
            });
          }).then(adjustments => {
            return _.concat(adjustments, validated.purchases.adjustments);
          }),
          subscriptions: Promise.map(subscriptionsToPurchase, subscriptionObject => {
            const sku = _.get(subscriptionObject, [SKU_KEY]);
            const addOns = _.get(subscriptionObject, [ADD_ONS_KEY]);
            return modelsDashboard.RecurlySubscriptionSku.forge().where({
              sku,
            }).fetch({
              columns: [
                'id',
                'subscription',
              ],
              transacting,
            }).then(subscription => {
              if (!subscription) {
                throw new Error(`Did not find a subscription with an SKU of ${_.get(subscriptionObject, [SKU_KEY])}.`);
              }

              if (mutuallyExclusiveSubscriptionIds.includes(subscription.get('subscription'))) {
                isCancellingExisting = true;
              }

              const subscriptionPurchase = {
                plan_code: sku,
              };

              if (addOns.length > 0) {
                const addOnObjects = addOns.map(addOn => {
                  return {
                    subscription_add_on: {
                      add_on_code: _.get(addOn, [SKU_KEY]),
                      quantity: _.get(addOn, [QUANTITY_KEY]),
                    },
                  };
                });
                _.set(subscriptionPurchase, ['subscription_add_ons'], addOnObjects);
              }

              return subscriptionPurchase;
            });
          }),
        });
      });
    }).then(result => {
      return RecurlyWrapper.getLibrary().purchases.create({
        currency: 'USD',
        account: {
          account_code: userId,
        },
        adjustments: {
          adjustment: result.adjustments,
        },
        subscriptions: {
          subscription: result.subscriptions,
        },
      });
    }).then(async response => {
      const invoiceIdsForClient = _.get(response, ['data', 'invoice_collection', 'charge_invoice', 'invoice_number', '_']);

      const recurlyManagerEngine = new RecurlyManagerEngine(userId);
      const manager = new SubscriptionsManager(recurlyManagerEngine);

      const invoices = RecurlyWrapper.getNormalizedItem(_.get(response, [
        'data',
        'invoice_collection',
        'charge_invoice',
      ]));
      const postWebhookOptions = await manager.updateAppDataFromInvoicesAsync(invoices);

      res.json({
        success: true,
        invoices: invoiceIdsForClient,
      });

      return postWebhookOptions;
    }).then(postWebhookOptionsSet => {
      return Promise.all([
        Promise.map(postWebhookOptionsSet, options => {
          return WebhookHandler.handlePostWebhookActions(options);
        }),
        Promise.try(() => {
          if (!isCancellingExisting) {
            return false;
          }

          return Promise.props({
            terminateConflictingSubscriptions: subscriptionsToRemove.then(illegalSubscriptions => {
              return Promise.all(_.map(illegalSubscriptions.toJSON(), subscription => {
                return new Promise(resolve => {
                  RecurlyWrapper.getLibrary().subscriptions.terminate(subscription.external_id, 'none', () => {
                    return resolve(true);
                  });
                });
              }));
            }),
          });
        }),
      ]);
    }).then(async () => {
      if (!userId) {
        return null;
      }

      return BookshelfDashboard.transaction(transacting => {
        return PermissionConflict.announceConflictChange({
          userId,
          permissions: PermissionConflictConstants.PERMISSIONS_SESSIONS,
          previousState: wasInConflict,
          transacting,
        });
      });
    });
  }).catch(next);
});

router.get('/invoice/:id', (req, res, next) => {
  return Promise.try(() => {
    const recurlyManagerEngine = new RecurlyManagerEngine(req.user.id);
    const manager = new SubscriptionsManager(recurlyManagerEngine);

    const invoiceId = parseInt(req.params.id, 10);

    return manager.getInvoicePdf(invoiceId);
  }).then(invoiceBuffer => {
    res.setHeader('content-type', 'application/pdf');
    return res.send(invoiceBuffer);
  }).catch(next);
});

module.exports = router;

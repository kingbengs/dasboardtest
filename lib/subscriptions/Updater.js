const _ = require('lodash');
const Promise = require('bluebird');
const {
  models: {
    dashboard: modelsDashboard,
  },
} = require('@funnelytics/shared-data');
const WooDateContainer = require('./WooDateContainer');
const SubscriptionStatus = require('./SubscriptionStatus');
const SubscriptionStatuses = require('./SubscriptionStatuses');
const SubscriptionResponse = require('./SubscriptionResponse');
const WooSubscriptionWrapper = require('./WooSubscriptionWrapper');
const UserSubscriptionsManager = require('./UserSubscriptionsManager');
const { verifiedSubscriptionSKUs } = require('./helpers');
const TapFiliateOrder = require('../commerce/third-party/affiliates/TapFiliateOrder');

const { LogLevels } = requireRoot('/config/winston');
const { loggerMissingUser, loggerNoSubscriptions } = requireRoot('/config/winston/loggers');

module.exports = class Updater {
  constructor({
    wooSubscription, transacting, response, email,
  }) {
    if (!(response instanceof SubscriptionResponse)) {
      throw new Error('response must be instance of SubscriptionResponse');
    }
    if (!(wooSubscription instanceof WooSubscriptionWrapper)) {
      throw new Error('wooSubscription must be instance of WooSubscriptionWrapper');
    }

    this.wooSubscription = wooSubscription;
    this.transacting = transacting;
    this.response = response;
    this.email = email;
  }

  getEmail() {
    return this.email;
  }

  getSubscription() {
    return this.wooSubscription;
  }

  getTransacting() {
    return this.transacting;
  }

  findOrCreateSubscription({
    query, columns,
  }) {
    return modelsDashboard.Subscription.forge(query)
      .fetch({
        columns,
        transacting: this.getTransacting(),
      })
      .then(subscriptionRecord => {
        let isNew = false;
        if (subscriptionRecord) {
          return [subscriptionRecord, isNew];
        }

        isNew = true;
        return [new modelsDashboard.Subscription(query), isNew];
      });
  }

  getSubscriptionsToDestroy({ userId, currentSubscriptionProductIds, withRelated }) {
    return modelsDashboard.Subscription.forge().where(qb => {
      qb.where('user', userId);
      qb.where('woo_subscription_id', this.getSubscription().getId());
      qb.whereNotIn('subscription_product', currentSubscriptionProductIds);
    }).fetchAll({
      withRelated,
      transacting: this.getTransacting(),
    });
  }

  manuallyDeleteSubscription(subscription) {
    const destroyedSubscriptionId = subscription.get('id');
    subscription.set('status', SubscriptionStatuses.ManualDelete);
    return subscription.destroy({ transacting: this.getTransacting() }).then(() => { return destroyedSubscriptionId; });
  }

  /**
   * Delete subscriptions that are part of this woo commerce subscription but are not in the currentSubscriptionProductIds array
   */
  async deleteOldSubscriptions({ userId, subscriptionProducts }) {
    const currentSubscriptionProductIds = subscriptionProducts.map(product => { return product.get('id') ;});

    const subscriptionsToDestory = await this.getSubscriptionsToDestroy({
      userId,
      currentSubscriptionProductIds,
      withRelated: ['subscription_product.membership'],
    });

    const productNames = subscriptionsToDestory.reduce((productNamesHash, subscription) => {
      _.set(
        productNamesHash,
        subscription.get('id'),
        subscription.related('subscription_product').related('membership').get('name'),
      );

      return productNamesHash;
    }, {});

    subscriptionsToDestory
      // Product is now cancelled if it was, prior to now, considered active
      .filter(subscription => { return (new SubscriptionStatus(subscription.get('status'))).isActive() ;})
      .forEach(subscription => {
        this.getResponse().addCancelledProduct(
          _.capitalize(_.get(productNames, subscription.get('id'))),
        );
      });

    // Delete all subscriptions we will not be working with before proceeding.
    const destroyedSubscriptionsIds = await Promise.all(subscriptionsToDestory.map(subscription => { return this.manuallyDeleteSubscription(subscription) ;}));

    destroyedSubscriptionsIds.forEach(id => { 
return this.getResponse().addSubscriptionMessage({
      verb: 'Deleted',
      id,
      productName: _.capitalize(_.get(productNames, id)),
      status: SubscriptionStatuses.ManualDelete,
    }) ;
});

    return true;
  }

  async asyncGetUser({ columns, withRelated }) {
    const user = await modelsDashboard.User.forge({
      email: this.getEmail(),
    }).fetch({
      columns,
      withRelated,
      transacting: this.getTransacting(),
    });
    if (!user) {
      const error = new Error(`The user with email "${this.getEmail()}" is not in our database.`);
      loggerMissingUser.logWithOptions({ error });
      throw error;
    }

    return user;
  }

  async asyncGetSubscriptionProducts({ columns, withRelated }) {
    const subscriptionSkus = await verifiedSubscriptionSKUs({
      transacting: this.getTransacting(),
      skus: this.getSubscription().getLineItemSkus(),
    });

    return modelsDashboard.SubscriptionProduct
      .forge()
      .where(qb => {
        qb.whereIn('sku', subscriptionSkus);
      })
      .fetchAll({
        columns,
        withRelated,
        transacting: this.getTransacting(),
      });
  }

  getResponse() {
    return this.response;
  }

  updateSubscriptionDate(subscriptionModel, dateColumn, wooDate) {
    const dateUpdater = new WooDateContainer({
      wooDate,
      dbDate: subscriptionModel.get(dateColumn),
    });

    if (dateUpdater.mustUpdateDate()) {
      subscriptionModel.set(dateColumn, dateUpdater.getLatestDate());
    }
  }

  async updateSingleSubscription({ subscriptionProduct, userId }) {
    /**
       * Get subscription record based on this user and the WooCommerce subscription ID and the
       * subscription product ID
       */
    const [userSubscription, isNewSubscription] = await this.findOrCreateSubscription({
      query: {
        woo_subscription_id: this.getSubscription().getId(),
        user: userId,
        subscription_product: subscriptionProduct.get('id'),
      },
      columns: ['id', 'status', 'previous_payment', 'next_payment'],
    });
    const oldSubscriptionStatus = new SubscriptionStatus(isNewSubscription
      ? this.getSubscription().getStatus()
      : userSubscription.get('status'));
    const newSubscriptionStatus = new SubscriptionStatus(this.getSubscription().getStatus());

    const subscriptionStatusChanged = newSubscriptionStatus.isActive() !== oldSubscriptionStatus.isActive();

    const subscriptionActivityChanged = isNewSubscription || subscriptionStatusChanged;

    if (isNewSubscription || newSubscriptionStatus.getName() !== oldSubscriptionStatus.getName()) {
      userSubscription.set('status', newSubscriptionStatus.getName());
    }

    let first = userSubscription.get('next_payment');
    let second = new Date(this.getSubscription().getNextPayment());
    second.setHours(second.getHours() - 4); // Make this EST

    if (this.getSubscription().getStatus() === 'active' && first && second) {
      first = first.getTime();
      second = second.getTime();
      const user = await this.asyncGetUser({
        columns: ['tapfiliate_referrer'],
      });
      // Checks that the last payment we knew of does not match the (potentially) new payment date
      if (user) {
        if (first - second !== 0) {
          const order = new TapFiliateOrder(this.getSubscription().getId());
          order.convert(this.getSubscription().getTotal(), this.transacting, {
            affiliate: user.get('tapfiliate_referrer'),
          });
        }
      }
    }

    // Handle payment times
    this.updateSubscriptionDate(userSubscription, 'previous_payment', this.getSubscription().getPreviousPayment());
    this.updateSubscriptionDate(userSubscription, 'next_payment', this.getSubscription().getNextPayment());

    if (userSubscription.hasChanged()) {
      await userSubscription
        .save(null, { transacting: this.getTransacting() })
        .then(savedSubscription => {
          const subscriptionProductName = _.capitalize(subscriptionProduct.related('membership').get('name'));
          const sharedSubscriptionMessageDetails = {
            id: savedSubscription.get('id'),
            productName: subscriptionProductName,
            status: this.getSubscription().getStatus(),
          };
          if (subscriptionActivityChanged) {
            if (newSubscriptionStatus.isActive()) {
              this.getResponse().addSubscriptionMessage({
                verb: 'Activated',
                ...sharedSubscriptionMessageDetails,
              });
              this.getResponse().addEnabledProduct(subscriptionProductName);
            } else if (!isNewSubscription) {
              // New subscriptions that are created in inactive state are not considered newly cancelled.
              this.getResponse().addSubscriptionMessage({
                verb: 'Cancelled',
                ...sharedSubscriptionMessageDetails,
              });
              this.getResponse().addCancelledProduct(subscriptionProductName);
            } else {
              this.getResponse().addSubscriptionMessage({
                verb: 'Created',
                ...sharedSubscriptionMessageDetails,
              });
            }
          } else {
            this.getResponse().addSubscriptionMessage({
              verb: 'Updated',
              ...sharedSubscriptionMessageDetails,
            });
          }
        });
    }

    return true;
  }

  updateSubscriptions(req) {
    return Promise.try(async () => {
      let user;
      try {
        user = await this.asyncGetUser({
          columns: ['id', 'email', 'membership'],
        });
      } catch (e) {
        this.getResponse().addMessage('No user found on this subscription.');
        return this.getResponse();
      }

      // Get all funnelytics memberships passed in as SKUs
      const subscriptionProducts = await this.asyncGetSubscriptionProducts({
        columns: ['id', 'membership'],
        withRelated: ['membership'],
      });

      // Delete existing subscriptions not in the list of passed SKUs
      await this.deleteOldSubscriptions({ userId: user.get('id'), subscriptionProducts });

      /**
       * Sequentially update each DB subscription associated with this woo commerce subscription
       */
      await Promise.try(() => { 
return subscriptionProducts.reduce(
        (promiseChain, subscriptionProduct) => {return promiseChain.then(chainResults => Promise.try(() => this.updateSingleSubscription({
          subscriptionProduct,
          userId: user.get('id'),
        })).then(currentResult => [...chainResults, currentResult]))}, Promise.resolve([]),
      ) 
;});

      if (subscriptionProducts.length <= 0) {
        loggerNoSubscriptions.logWithOptions({
          request: req,
          message: 'No subscription products present on this subscription.',
          level: LogLevels.Warn,
        });
      }

      if (this.getResponse().subscriptionsModified()) {
        const userSubscriptionManager = new UserSubscriptionsManager({
          userId: user.get('id'),
          transacting: this.getTransacting(),
          response: this.getResponse(),
        });

        await userSubscriptionManager.updateUserPermissions();
      }


      return this.getResponse();
    });
  }
};

'use strict';

const Promise = require('bluebird');
const _ = require('lodash');
const {
  models: {
    dashboard: modelsDashboard,
  },
  databases: {
    dashboard: BookshelfDashboard,
  },
  serializer: JSONAPI,
} = require('@funnelytics/shared-data');

const express = require('express');
const TieredPrice = require('../lib/commerce/subscriptions/tiers/TieredPrice');
const SubscriptionsManager = require('../lib/commerce/subscriptions/SubscriptionsManager');
const RecurlyManagerEngine = require('../lib/commerce/subscriptions/manager-engines/RecurlyManagerEngine');
const Subscription = require('../lib/commerce/subscriptions/objects/Subscription');
const SubscriptionConstants = require('../lib/commerce/subscriptions/constants/SubscriptionConstants');
const SlackIntegration = require('../lib/integrations/SlackIntegration');
// const Drip = require('../lib/integrations/Drip');
// const SubscriptionModificationConstants = require('../lib/commerce/subscriptions/constants/SubscriptionModificationConstants');

const router = express.Router();

// GET /, /find
router.get(['/', '/find'], (req, res, next) => {
  // Get subscriptions currently active for the user
  return Promise.try(() => {
    return BookshelfDashboard.transaction(transacting => {
      return modelsDashboard.RecurlyUserSubscription.forge().query(qb => {
        qb.where('user', req.user.id);
        qb.whereIn('status', Subscription.getActiveStatuses());
      }).fetchAll({
        transacting,
        withRelated: [
          {
            subscription(qb) {
              qb.column('id', 'name');
            },
            'subscription.subscriptionPermissions': function (qb) {
              qb.column('id', 'subscription', 'permission');
            },
            'subscription.subscriptionPermissions.permission': function (qb) {
              qb.column('id', 'name');
            },
            add_ons(qb) {
              qb.column('id', 'unit_amount_in_cents', 'quantity', 'user_subscription', 'add_on');
            },
            'add_ons.add_on': function (qb) {
              qb.column('id', 'name');
            },
          },
        ],
        columns: [
          'id',
          'status',
          'user',
          'subscription',
          'term_ends_at',
          'period_ends_at',
          'unit_amount_in_cents',
          'remaining_billing_cycles',
          'external_id',
        ],
      }).then(userSubscriptions => {
        return Promise.map(userSubscriptions, userSubscription => {
          return BookshelfDashboard.knex.raw(
            `
              SELECT
                ruqs.id,
                ruqs.subscription AS user_subscription,
                ruqs.switch_date,
                rs.name AS new_plan_name,
                ruqs.new_plan_code,
                ruqs.new_plan_period_price_in_cents,
                ruqs.new_plan_period_unit,
                ruqs.new_plan_period_length,
                ruqs.new_plan_periods_in_term,
                ruqs.created_at,
                ruqs.updated_at
              FROM recurly_user_queued_subscriptions ruqs
              JOIN recurly_subscription_skus rss ON ruqs.new_plan_code = rss.sku
              JOIN recurly_subscriptions rs ON rs.id = rss.subscription
              WHERE ruqs.subscription = ?
              AND ruqs.switch_date = ?
            `,
            [
              userSubscription.get('id'),
              userSubscription.get('period_ends_at'),
            ],
          ).transacting(transacting).then(result => {
            return _.merge(userSubscription.toJSON(), {
              queued_subscription: _.get(result, 'rows.0', {}),
            });
          });
        });
      });
    });
  }).then(async parsed => {
    const tieredPrice = new TieredPrice(req.user.id);
    await tieredPrice.setMonthlyAddOnTierPrice(parsed);

    return JSONAPI.serializeAsync('recurly-user-subscription', parsed);
  }).then(body => {
    return res.json(body);
  }).catch(err => {
    return next(err);
  });
});

// PATCH /:id
router.patch(['/:id', '/edit/:id'], (req, res, next) => {
  // Update the user subscription...
  return Promise.try(() => {
    const subscriptionToUpdate = JSONAPI.deserialize('recurly-user-subscription', req.body);

    const newStatus = _.get(subscriptionToUpdate, 'status');
    if (newStatus !== SubscriptionConstants.STATUS_CANCELLING) {
      throw new Error(
        `Attempted to patch userSubscription with status "${newStatus}".
Can only update status to "${SubscriptionConstants.STATUS_CANCELLING}".`,
      );
    }

    return BookshelfDashboard.knex.transaction(transacting => {
      return Promise.props({
        userSubscription: modelsDashboard.RecurlyUserSubscription.forge().where({
          user: req.user.id,
          id: req.params.id,
        }).fetch({
          transacting,
          columns: [
            'id',
            'status',
            'user',
            'subscription',
            'term_ends_at',
            'external_id',
          ],
          withRelated: [{
            subscription(qb) {
              qb.column('id', 'name');
            },
          }],
        }),
        userRecord: modelsDashboard.User.forge().where({
          id: req.user.id,
        }).fetch({
          transacting,
          columns: ['id', 'email'],
        }),
      }).then(({ userSubscription, userRecord }) => {
        if (!userSubscription) {
          throw new Error(`No subscription "${req.params.id}" found for user "${req.user.id}"`);
        }

        const manager = new SubscriptionsManager(new RecurlyManagerEngine(req.user.id));
        // TODO: Might want to ensure that the subscription is currently active to not
        // TODO: get an error on this and miss the database update
        return manager.cancelSubscriptionAsync(userSubscription.get('external_id')).then(() => {
          const currentStatus = userSubscription.get('status');
          if (currentStatus === SubscriptionConstants.STATUS_CANCELLING) {
            return {
              updated: false,
              userSubscription,
            };
          }

          return modelsDashboard.RecurlyUserSubscription.forge().where({
            user: req.user.id,
            id: req.params.id,
          }).save({
            status: newStatus,
          }, {
            patch: true,
            transacting,
            returning: [
              'id',
              'status',
              'user',
              'subscription',
              'term_ends_at',
            ],
          }).then(updatedUserSubscription => {
            return {
              updated: true,
              email: userRecord.get('email'),
              subscriptionName: userSubscription.related('subscription').get('name'),
              userSubscription: updatedUserSubscription,
            };
          }).catch(err => {
            throw err;
          });
        });
      });
    }).then(subscriptionUpdateInfo => {
      // if (subscriptionUpdateInfo.updated) {
      //   return Drip.createEvent(
      //     subscriptionUpdateInfo.email,
      //     `${SubscriptionModificationConstants.PENDING_CANCELLATION} ${subscriptionUpdateInfo.subscriptionName} Subscription`,
      //   ).then(() => {
      //     return subscriptionUpdateInfo.userSubscription;
      //   });
      // }
      return subscriptionUpdateInfo.userSubscription;
    }).then(updatedSubscription => {
      return JSONAPI.serializeAsync('recurly-user-subscription', updatedSubscription.toJSON());
    }).then(body => {
      return res.json(body);
    });
  }).catch(err => {
    const errorMessage = _.get(err, ['data', 'error', 'description'], err.message);
    SlackIntegration.sendMessage(
      `Failure when trying to cancel subscription for user \`${req.user.id}\`.

Message: ${errorMessage}`,
    );

    return next(err);
  });
});

// GET /:id, /delete/:id
router.delete(['/:id', '/delete/:id'], (req, res, next) => {
  return Promise.try(() => {
    const userId = req.user.id;
    const manager = new SubscriptionsManager(new RecurlyManagerEngine(userId));
    const subscriptionId = req.params.id;
    return manager.cancelSubscriptionAsync(subscriptionId).then(confirmation => {
      return res.json(confirmation);
    });
  }).catch(err => {
    if (err.statusCode === 404) {
      return res.json({});
    }
    return next(err);
  });
});

module.exports = router;

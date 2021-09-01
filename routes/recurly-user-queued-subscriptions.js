'use strict';

const Promise = require('bluebird');
const {
  models: {
    dashboard: modelsDashboard,
  },
  databases: {
    dashboard: BookshelfDashboard,
  },
  errors,
  serializer: JSONAPI,
} = require('@funnelytics/shared-data');
const Joi = require('@hapi/joi');
const express = require('express');

const router = express.Router();

// GET /
router.post(['/'], (req, res, next) => {
  return Promise.try(async () => {
    const body = await Promise.try(() => {
      return Joi.object().keys({
        subscription: Joi.string().uuid({
          version: ['uuidv4'],
        }),
        new_plan_code: Joi.string(),
      }).validateAsync(req.body, {
        stripUnknown: true,
      });
    });
    // TODO: Do we want to fromJoi() this error?

    return BookshelfDashboard.transaction(async transacting => {
      const [
        plan,
        subscription,
      ] = await Promise.all([
        modelsDashboard.RecurlySubscriptionSku.forge().where({
          sku: body.new_plan_code,
        }).fetch({
          transacting,
          columns: [
            'period_price_in_cents',
            'period_unit',
            'period_length',
            'periods_in_term',
          ],
        }),

        modelsDashboard.RecurlyUserSubscription.forge().where({
          user: req.user.id,
          id: body.subscription,
        }).fetch({
          transacting,
          columns: [
            'term_ends_at',
          ],
        }),
      ]);

      if (!plan || !subscription) {
        throw errors.predefined.generic.forbidden;
      }

      return modelsDashboard.RecurlyUserQueuedSubscription.forge().where({
        subscription: body.subscription,
      }).upsert({
        subscription: body.subscription,
        new_plan_code: body.new_plan_code,
        switch_date: subscription.get('term_ends_at'),
        new_plan_period_price_in_cents: plan.get('period_price_in_cents'),
        new_plan_period_unit: plan.get('period_unit'),
        new_plan_period_length: plan.get('period_length'),
        new_plan_periods_in_term: plan.get('periods_in_term'),
      }, {
        returning: 'id',
        transacting,
      }).then(queued => {
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
            WHERE ruqs.id = ?
          `,
          [
            queued.get('id'),
          ],
        ).transacting(transacting);
      });
    });
  }).then(results => {
    return JSONAPI.serializeAsync('recurly-user-queued-subscription', results.rows[0]);
  }).then(serialized => {
    return res.json(serialized);
  }).catch(err => {
    return next(err);
  });
});

module.exports = router;

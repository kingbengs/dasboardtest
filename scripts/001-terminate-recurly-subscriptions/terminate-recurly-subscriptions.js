'use strict';

const Bluebird = require('bluebird');
const _ = require('lodash');
const {
  databases: {
    dashboard: BookshelfDashboard,
  },
} = require('@funnelytics/shared-data');

const RecurlyWrapper = require('../../lib/commerce/subscriptions/recurly/RecurlyWrapper');
const config = require('./config');

const RecurlyLibrary = RecurlyWrapper.getLibrary();

const RECURLY_STATUS_SUCCESS = 200;

const Postgres = Object.freeze({
  RECURLY_ID: 'external_id',
  DB_ID: 'id',
  SUBSCRIPTION_TYPE_ID: 'subscription',
  SUBSCRIPTION_STATE: 'status',
});

function runTermination(recurlySubscriptionId) {
  if (config.IS_TEST) {
    console.log('INFO: Test mode is active. No change is being made to this subscription:');
    return RecurlyLibrary.subscriptions.updatePreview(recurlySubscriptionId, {});
  }
  const REFUND_TYPE = 'none'; // full, partial refund types generate errors.
  return RecurlyLibrary.subscriptions.terminate(recurlySubscriptionId, REFUND_TYPE);
}

function processSubscriptions({
  transacting,
  offset = 0,
  limit,
  processFunction,
  columns,
}) {
  return Bluebird.try(() => {
    const queryBuilder = BookshelfDashboard.knex.queryBuilder().transacting(transacting);
    queryBuilder.select(columns).from(
      'recurly_user_subscriptions',
    ).where({
      [Postgres.SUBSCRIPTION_TYPE_ID]: config.SUBSCRIPTION_UUID,
    }).whereNotIn(
      [Postgres.SUBSCRIPTION_STATE],
      config.EXPIRED_SUBSCRIPTION_STATES,
    ).orderBy(
      'created_at',
      'ASC',
    ).limit(
      limit,
    ).offset(
      offset,
    );
    return queryBuilder.then(subscriptionsPage => {
      const hasMoreSubsriptions = subscriptionsPage.length === limit;
      return processFunction(subscriptionsPage).then(() => {
        if (hasMoreSubsriptions) {
          return processSubscriptions({
            transacting,
            offset: offset + limit,
            limit,
            processFunction,
            columns,
          });
        }
        return true;
      });
    });
  });
}

function terminateSubscriptions({
  subscriptionsToTerminate,
  throttleInMs,
}) {
  return Bluebird.try(() => {
    const startTimeInMs = Date.now();
    if (_.get(subscriptionsToTerminate, ['length'], 0) === 0) {
      return true;
    }
    const { [Postgres.RECURLY_ID]: recurlyId, [Postgres.DB_ID]: databaseId } = subscriptionsToTerminate.pop();
    return RecurlyLibrary.subscriptions.get(recurlyId).then(recurlyResponse => {
      const queryStatusCode = _.get(recurlyResponse, ['statusCode']);
      if (queryStatusCode !== RECURLY_STATUS_SUCCESS) {
        throw new Error(
          `Error when querying for Recurly subscription ${recurlyId}. Expected status code ${RECURLY_STATUS_SUCCESS}, received ${queryStatusCode}`,
        );
      }
      const subscription = _.get(recurlyResponse, ['data', 'subscription']);
      const subscriptionState = _.get(subscription, ['state']);
      const mustBeTerminated = config.ACTIVE_SUBSCRIPTION_STATES.includes(subscriptionState);
      if (mustBeTerminated) {
        return runTermination(recurlyId).then(terminatedResponse => {
          const terminationStatusCode = _.get(terminatedResponse, ['statusCode']);
          if (terminationStatusCode !== RECURLY_STATUS_SUCCESS) {
            throw new Error(
              `Error when terminating for Recurly subscription ${recurlyId}. Expected status code ${RECURLY_STATUS_SUCCESS}, received ${terminationStatusCode}`,
            );
          }
          console.log(`SUCCESS: Termination of subscription with ID ${recurlyId} (PostgreSQL ID ${databaseId}) succeeded!`);
        }).catch(err => {
          console.log(`FAILURE: Termination of subscription with ID ${recurlyId} (PostgreSQL ID ${databaseId}) failed!`);
          throw err;
        });
      }
      console.log(`INFO: Subscription with ID ${recurlyId} (PostgreSQL ID ${databaseId}) skipped! Has state "${subscriptionState}".`);
      return true;
    }).then(() => {
      return new Bluebird((resolve, reject) => {
        try {
          const endTimeInMs = Date.now();
          const difference = endTimeInMs - startTimeInMs;
          const extraThrottleRequired = Math.max(throttleInMs - difference, 0);
          setTimeout(() => {
            resolve(terminateSubscriptions({
              subscriptionsToTerminate,
              throttleInMs,
            }));
          }, extraThrottleRequired);
        } catch (err) {
          reject(err);
        }
      });
    });
  });
}

function main() {
  BookshelfDashboard.knex.transaction(transacting => {
    return processSubscriptions({
      transacting,
      limit: config.SUBSCRIPTION_PAGE_SIZE,
      columns: [Postgres.RECURLY_ID, Postgres.DB_ID],
      processFunction: subscriptionsPage => {
        return Bluebird.try(() => {
          return terminateSubscriptions({
            subscriptionsToTerminate: subscriptionsPage,
            throttleInMs: config.RATE_LIMIT_DELAY_IN_MS,
          });
        });
      },
    });
  }).then(() => {
    return process.exit();
  }).catch(err => {
    console.log(err);
    return process.exit(1);
  });
}
main();

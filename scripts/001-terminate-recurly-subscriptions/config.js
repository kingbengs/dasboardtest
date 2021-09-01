'use strict';

const {
  uuid: {
    SubscriptionIdentifier,
  },
} = require('@funnelytics/shared-data');

const SubscriptionConstants = require('../../lib/commerce/subscriptions/constants/SubscriptionConstants');

module.exports = {
  /**
   * Any found subscriptions with the following states (stored on Recurly) will be terminated
   */
  ACTIVE_SUBSCRIPTION_STATES: [
    SubscriptionConstants.STATUS_ACTIVE,
    SubscriptionConstants.STATUS_CANCELLING,
  ],
  /**
   * Subscription with any of these states will not be processed. Records with this state will be
   * filtered out of the result when initially querying our own database.
   */
  EXPIRED_SUBSCRIPTION_STATES: [
    SubscriptionConstants.STATUS_INACTIVE,
  ],
  /**
   * Set to true for a dry run of script where subscription will not actually be terminated
   */
  IS_TEST: false,
  /**
   * 400/minute for sandbox and 1000/minute for production is max allowed
   * In case we have other requests going on at the same time we can limit to 240 and 600 respectively.
   * Since we run two recurly requests for each subscription (one lookup and one to terminate), the timeout
   * numbers are doubled.
   *
   * Recommended minimum delays:
   * SANDBOX: 500 ms
   * PRODUCTION: 200 ms
   */
  RATE_LIMIT_DELAY_IN_MS: 500,
  /**
   * The UUID identifying the configured subscription in PostgreSQL that we want to terminate for all users
   */
  SUBSCRIPTION_UUID: SubscriptionIdentifier.ADDITIONAL_WORKSPACES_1_FREE,
  /**
   * Number of subscriptions to pull from PostgreSQL at a time
   */
  SUBSCRIPTION_PAGE_SIZE: 100,
};

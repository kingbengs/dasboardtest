const loggerGenerator = requireRoot('/config/winston/logger-generator');

module.exports = {
  // loggerDripError: loggerGenerator('drip-error'),
  loggerMissingUser: loggerGenerator('missing-user'),
  loggerModifySubscription: loggerGenerator('modify-subscription'),
  loggerDoNotModifySubscription: loggerGenerator('do-not-modify-subscription'),
  loggerNoSubscriptions: loggerGenerator('no-subscriptions'),
  loggerWooSubscriptionError: loggerGenerator('woo-subscription-error'),
  loggerWooOrderError: loggerGenerator('woo-order-error'),
  loggerFoundingMember: loggerGenerator('founding-member'),
  loggerMembershipChange: loggerGenerator('membership-change'),
  loggerOrderStatus: loggerGenerator('order-status'),
  loggerSubscriptionCreationError: loggerGenerator('subscription-creation-error'),
  loggerOrderNewTransaction: loggerGenerator('order-new-transaction'),
  loggerOrderNotProcessed: loggerGenerator('order-not-processed'),
  loggerOrderFailed: loggerGenerator('order-failed'),
  loggerOrderCompleted: loggerGenerator('order-completed'),
  loggerMissingCustomerEmail: loggerGenerator('missing-customer-email'),
  loggerUnexpected: loggerGenerator('unexpected'),
};

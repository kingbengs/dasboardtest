const _ = require('lodash');
const SubscriptionStatuses = require('./SubscriptionStatuses');

module.exports = class SubscriptionStatus {
  constructor(name) {
    if (!_.values(SubscriptionStatuses).includes(name)) {
      throw new Error(`Subscription Status ${name} is invalid.`);
    }

    this.name = name;
  }

  getName() {
    return this.name;
  }

  isActive() {
    return [SubscriptionStatuses.Active, SubscriptionStatuses.PendingCancel].includes(
      this.getName(),
    );
  }
};

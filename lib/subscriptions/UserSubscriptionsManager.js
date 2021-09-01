const _ = require('lodash');
const {
  models: {
    dashboard: modelsDashboard,
  },
} = require('@funnelytics/shared-data');

const { loggerFoundingMember, loggerMembershipChange } = requireRoot('/config/winston/loggers');
const { LogLevels } = requireRoot('/config/winston');
const Memberships = requireRoot('/constants/memberships');
const SubscriptionStatus = require('./SubscriptionStatus');
const SubscriptionResponse = require('./SubscriptionResponse');

//* NOTE: These must be arranged in order of highest to lowest access
const MEMBERSHIPS = Object.freeze([
  {
    id: Memberships.Pro,
    name: 'Premium',
  },
  {
    id: Memberships.Vault,
    name: 'Vault',
  },
  {
    id: Memberships.Starter,
    name: 'Starter',
  },
]);
const recognizedMembershipIds = _.map(MEMBERSHIPS, m => { return _.get(m, 'id'); });

function subscriptionMembershipUnrecognizedErrorText(passedMembership) {
  return `The membership from this subscription is not recognized by the program.

  This subscription membership ID: ${passedMembership}

  Only the following membership IDs are recognized: [${recognizedMembershipIds.join(', ')}]
  `;
}

module.exports = class UserSubscriptionsManager {
  constructor({ response, userId, transacting }) {
    if (!(response instanceof SubscriptionResponse)) {
      throw new Error('response passed to UserSubscriptionsManager must be instance of SubscriptionResponse');
    }
    this.response = response;

    this.userId = userId;
    this.transacting = transacting;
  }

  getTransacting() {
    return this.transacting;
  }

  getCurrentMembership() {
    return this.membershipId;
  }

  getUserId() {
    return this.userId;
  }

  getResponse() {
    return this.response;
  }

  compareMemberships(a, b) {
    const indexOfA = _.indexOf(recognizedMembershipIds, a);
    const indexOfB = _.indexOf(recognizedMembershipIds, b);

    if (indexOfA < indexOfB) {
      return -1;
    }
    if (indexOfA > indexOfB) {
      return 1;
    }

    return 0;
  }

  getHighestMembership(membershipIds) {
    if (membershipIds.length <= 0) {
      return Memberships.Starter;
    }

    const clonedMemberships = _.clone(membershipIds);

    const sortedMemberships = clonedMemberships.sort(this.compareMemberships);

    return _.get(sortedMemberships, 0);
  }

  async updateUserPermissions() {
    const user = await modelsDashboard.User.forge().where(qb => {
      qb.where('id', this.getUserId());
    }).fetch({
      columns: ['id', 'membership', 'founding_member'],
      withRelated: ['subscriptions.subscription_product'],
      transacting: this.getTransacting(),
    });

    const userIsAFoundingMember = user.get('founding_member');

    if (userIsAFoundingMember) {
      const message = `User '${user.get('id')}' is a founding member. No need to process subscriptions.`;
      loggerFoundingMember.logWithOptions({
        level: LogLevels.Info,
        message,
      });
      this.getResponse().addMessage(message);
      return false;
    }

    const userSubscriptionMemberships = user.related('subscriptions')
      .filter(subscription => { return (new SubscriptionStatus(subscription.get('status'))).isActive(); })
      .map(subscription => { return subscription.related('subscription_product').get('membership'); });

    userSubscriptionMemberships.forEach(membership => {
      if (!recognizedMembershipIds.includes(membership)) {
        throw new Error(subscriptionMembershipUnrecognizedErrorText(membership, recognizedMembershipIds));
      }
    });

    const highestMembershipFromSubscriptions = this.getHighestMembership(userSubscriptionMemberships);

    const oldUserMembership = user.get('membership');
    user.set('membership', highestMembershipFromSubscriptions);
    if (user.hasChanged()) {
      await user.save(null, { transacting: this.getTransacting() }).then(() => {
        const message = `User '${user.get('id')}' has had their membership changed from ${oldUserMembership} to ${highestMembershipFromSubscriptions}.`;
        loggerMembershipChange.logWithOptions({
          level: LogLevels.Info,
          message,
        });
        this.getResponse().addMessage(message);
      });
    }

    return true;
  }
};

'use strict';

const _ = require('lodash');

const {
  uuid: {
    SubscriptionIdentifier,
  },
  users: {
    User,
    meta: {
      UserMetaKeys,
    },
  },
} = require('@funnelytics/shared-data');

const {
  constants: {
    ProMonthlyTiers,
  },
} = require('@funnelytics/utilities');

const getMonthlyTiersAddOn = subscription => {
  const tiersAddOn = _.first(subscription.add_ons, addOn => {
    return addOn.id === SubscriptionIdentifier.ADD_ON_PRO_MONTHLY_TIERS;
  });
  return tiersAddOn;
};
const hasMonthlyTiersAddOn = subscription => {
  return Boolean(getMonthlyTiersAddOn(subscription));
};

class TieredPrice {
  constructor(userId) {
    this._user = new User(userId);
  }

  _getUser() {
    return this._user;
  }

  getMonthlySubscriptionTiersAddOns(userSubscriptions) {
    return userSubscriptions.filter(userSubscription => {
      return _.get(userSubscription, ['subscription', 'id']) === SubscriptionIdentifier.PRO_MONTHLY;
    }).filter(
      hasMonthlyTiersAddOn,
    ).map(
      getMonthlyTiersAddOn,
    );
  }

  async getMonthlyAddOnTierPrice(userSubscriptions) {
    const monthlySubscriptionTiersAddOns = this.getMonthlySubscriptionTiersAddOns(userSubscriptions);
    const isTrackingMonthlySessions = monthlySubscriptionTiersAddOns.length > 0;
    if (!isTrackingMonthlySessions) {
      return 0;
    }
    let sessionsTrackedThisPeriod = await this._getUser().getMeta(UserMetaKeys.SESSIONS_TRACKED_MONTHLY);
    if (!sessionsTrackedThisPeriod) {
      sessionsTrackedThisPeriod = 0;
    }
    const additionalTieredPrice = ProMonthlyTiers.TIERS.reduce((tieredPrice, tier) => {
      if (tier.sessions <= sessionsTrackedThisPeriod) {
        return tier.price;
      }

      return tieredPrice;
    }, ProMonthlyTiers.LOWEST_TIER_PRICE);
    return additionalTieredPrice;
  }

  async setMonthlyAddOnTierPrice(userSubscriptions) {
    const monthlySubscriptionTiersAddOns = this.getMonthlySubscriptionTiersAddOns(userSubscriptions);
    const additionalTieredPrice = await this.getMonthlyAddOnTierPrice(userSubscriptions);
    monthlySubscriptionTiersAddOns.forEach(addOn => {
      addOn.unit_amount_in_cents = additionalTieredPrice;
    });
  }
}

module.exports = TieredPrice;

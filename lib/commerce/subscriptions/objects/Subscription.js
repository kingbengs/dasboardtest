'use strict';

const _ = require('lodash');
const {
  Assertion,
} = require('@funnelytics/utilities');

const SubscriptionConstants = require('../constants/SubscriptionConstants');
const ExternalServiceStatusConstants = require('../external-services/constants/ExternalServiceStatusConstants');
const AddOn = require('./AddOn');

class Subscription {
  constructor({
    userId,
    SKU,
    status,
    externalId,
    affiliateCode = '',
    currentTermEndTime,
    currentPeriodEndTime,
    externalStatus = null,
    unitAmountInCents,
    remainingBillingCycles,
    addOns,
  }) {
    this.setUserId(userId);
    this.setSKU(SKU);
    this.setStatus(status);
    this.setExternalId(externalId);
    this.setAffiliateCode(affiliateCode);
    this.setCurrentTermEndTime(currentTermEndTime);
    this.setCurrentPeriodEndTime(currentPeriodEndTime);
    this.setExternalStatus(externalStatus);
    this.setUnitAmountInCents(unitAmountInCents);
    this.setRemainingBillingCycles(remainingBillingCycles);
    this.setAddOns(addOns);
  }

  getUserId() {
    return this._userId;
  }

  getSKU() {
    return this._SKU;
  }

  getStatus() {
    return this._status;
  }

  getExternalId() {
    return this._externalId;
  }

  getAffiliateCode() {
    const code = this._affiliateCode;

    if (_.isEmpty(code)) {
      return null;
    }

    return code;
  }

  getCurrentTermEndTime() {
    return this._currentTermEndTime;
  }

  getCurrentPeriodEndTime() {
    return this._currentPeriodEndTime;
  }

  getExternalStatus() {
    return this._externalStatus;
  }

  getUnitAmountInCents() {
    return this._unitAmountInCents;
  }

  getRemainingBillingCycles() {
    return this._remainingBillingCycles;
  }

  getSubscriptionRecordId() {
    return this._subscriptionRecordId;
  }

  getAddOns() {
    return this._addOns;
  }

  hasAddOns() {
    return this.getAddOns().length > 0;
  }

  isSubscriptionActive() {
    return Subscription.isStatusActive(this.getStatus());
  }

  setUserId(userId) {
    Assertion.uuid(userId);

    this._userId = userId;
  }

  setSKU(SKU) {
    Assertion.string(SKU);

    this._SKU = SKU;
  }

  setStatus(status) {
    Assertion.validString(status, [
      SubscriptionConstants.STATUS_ACTIVE,
      SubscriptionConstants.STATUS_CANCELLING,
      SubscriptionConstants.STATUS_INACTIVE,
    ]);

    this._status = status;

    if (!this.isSubscriptionActive()) {
      this.setCurrentTermEndTime(null);
    }
  }

  setExternalId(externalId) {
    Assertion.string(externalId);

    this._externalId = externalId;
  }

  setAffiliateCode(affiliateCode) {
    if (_.isEmpty(affiliateCode)) {
      this._affiliateCode = '';
      return;
    }

    Assertion.string(affiliateCode, { allowEmpty: true });

    this._affiliateCode = affiliateCode;
  }

  setCurrentTermEndTime(currentTermEndTime) {
    if (_.isEmpty(currentTermEndTime) || !this.isSubscriptionActive()) {
      this._currentTermEndTime = null;
      return;
    }

    Assertion.string(currentTermEndTime);

    this._currentTermEndTime = currentTermEndTime;
  }

  setCurrentPeriodEndTime(currentPeriodEndTime) {
    if (_.isEmpty(currentPeriodEndTime) || !this.isSubscriptionActive()) {
      this._currentPeriodEndTime = null;
      return;
    }

    Assertion.string(currentPeriodEndTime);

    this._currentPeriodEndTime = currentPeriodEndTime;
  }

  setExternalStatus(externalStatus) {
    if (externalStatus === null) {
      this._externalStatus = null;
      return;
    }

    Assertion.validString(externalStatus, [
      ExternalServiceStatusConstants.ACTION_REQUIRED,
      ExternalServiceStatusConstants.ACTIVATED,
      ExternalServiceStatusConstants.TERMINATED,
      ExternalServiceStatusConstants.ACTIVATION_FAILED,
      ExternalServiceStatusConstants.TERMINATION_FAILED,
    ]);

    this._externalStatus = externalStatus;
  }

  setUnitAmountInCents(unitAmountInCents) {
    Assertion.integer(unitAmountInCents);

    this._unitAmountInCents = unitAmountInCents;
  }

  setRemainingBillingCycles(remainingBillingCycles) {
    Assertion.integer(remainingBillingCycles);

    this._remainingBillingCycles = remainingBillingCycles;
  }

  setSubscriptionRecordId(subscriptionRecordId) {
    Assertion.uuid(subscriptionRecordId);

    this._subscriptionRecordId = subscriptionRecordId;
  }

  setAddOns(addOns) {
    Assertion.arrayOfInstancesOf(addOns, AddOn);

    this._addOns = addOns;
  }

  static getValidStatuses() {
    return [
      SubscriptionConstants.STATUS_ACTIVE,
      SubscriptionConstants.STATUS_CANCELLING,
      SubscriptionConstants.STATUS_INACTIVE,
    ];
  }

  static getActiveStatuses() {
    return [
      SubscriptionConstants.STATUS_ACTIVE,
      SubscriptionConstants.STATUS_CANCELLING,
    ];
  }

  static isStatusActive(status) {
    Assertion.validString(status, Subscription.getValidStatuses());

    return Subscription.getActiveStatuses().includes(status);
  }
}

module.exports = Subscription;

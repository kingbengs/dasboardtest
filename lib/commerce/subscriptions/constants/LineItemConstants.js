'use strict';

const {
  ConstantsProxy,
} = require('@funnelytics/utilities');

const LineItemConstants = ConstantsProxy.create({
  ORIGIN_PLAN: 'plan', //* Refers to Subscriptions. Do not change: directly from Recurly
  ORIGIN_ADD_ON: 'add_on', //* Refers to Subscription add ons. Do not change: directly from Recurly
});

module.exports = LineItemConstants;

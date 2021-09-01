'use strict';

const {
  ConstantsProxy,
} = require('@funnelytics/utilities');

const ExternalServiceTypeConstants = ConstantsProxy.create({
  SUBSCRIPTIONS: 'SUBSCRIPTIONS',
  PRODUCTS: 'PRODUCTS',
});

module.exports = ExternalServiceTypeConstants;

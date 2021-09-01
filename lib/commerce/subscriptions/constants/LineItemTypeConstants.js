'use strict';

const {
  ConstantsProxy,
} = require('@funnelytics/utilities');

const LineItemTypeConstants = ConstantsProxy.create({
  TYPE_PRODUCT: 'TYPE_PRODUCT',
  TYPE_SUBSCRIPTION: 'TYPE_SUBSCRIPTION',
  TYPE_ADD_ON: 'TYPE_ADD_ON',
});

module.exports = LineItemTypeConstants;

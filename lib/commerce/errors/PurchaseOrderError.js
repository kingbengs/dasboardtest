'use strict';

const {
  errors: {
    ExtendableError,
  },
} = require('@funnelytics/utilities');

class PurchaseOrderError extends ExtendableError {}

module.exports = PurchaseOrderError;

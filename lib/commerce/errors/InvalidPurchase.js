'use strict';

const {
  errors: {
    ExtendableError,
  },
} = require('@funnelytics/utilities');

class InvalidPurchase extends ExtendableError {}

module.exports = InvalidPurchase;

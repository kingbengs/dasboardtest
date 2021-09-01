'use strict';

const {
  errors: {
    ExtendableError,
  },
} = require('@funnelytics/utilities');

class SKUError extends ExtendableError {}

module.exports = SKUError;

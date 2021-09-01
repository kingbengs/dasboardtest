'use strict';

const {
  errors: {
    ExtendableError,
  },
} = require('@funnelytics/utilities');

class UnknownAffiliateError extends ExtendableError {}

module.exports = UnknownAffiliateError;

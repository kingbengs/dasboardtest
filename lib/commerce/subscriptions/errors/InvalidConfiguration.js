'use strict';

const {
  errors: {
    ExtendableError,
  },
} = require('@funnelytics/utilities');

class InvalidConfiguration extends ExtendableError {}

module.exports = InvalidConfiguration;

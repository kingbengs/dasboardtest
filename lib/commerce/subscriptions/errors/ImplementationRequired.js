'use strict';

const {
  errors: {
    ExtendableError,
  },
} = require('@funnelytics/utilities');

class ImplementationRequired extends ExtendableError {}

module.exports = ImplementationRequired;

'use strict';

const {
  ConstantsProxy,
} = require('@funnelytics/utilities');

const ExternalServiceStatusConstants = ConstantsProxy.create({
  ACTION_REQUIRED: 'action required',
  ACTIVATED: 'activated',
  TERMINATED: 'terminated',
  ACTIVATION_FAILED: 'activation failed',
  TERMINATION_FAILED: 'termination failed',
});

module.exports = ExternalServiceStatusConstants;

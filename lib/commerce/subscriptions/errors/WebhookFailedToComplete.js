'use strict';

const {
  errors: {
    ExtendableError,
  },
} = require('@funnelytics/utilities');

class WebhookFailedToComplete extends ExtendableError {}

module.exports = WebhookFailedToComplete;

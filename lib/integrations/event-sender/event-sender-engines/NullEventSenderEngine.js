'use strict';

const Promise = require('bluebird');

const {
  Assertion,
} = require('@funnelytics/utilities');

const EventSenderEngine = require('../EventSenderEngine');

class NullEventSenderEngine extends EventSenderEngine {
  sendEventImplementation(email, event) {
    Assertion.string(email);
    Assertion.string(event);

    return Promise.resolve(true);
  }
}

module.exports = NullEventSenderEngine;

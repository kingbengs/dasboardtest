'use strict';

const {
  Assertion,
} = require('@funnelytics/utilities');

class EventSenderEngine {
  sendEvent(email, event) {
    Assertion.string(email);
    Assertion.string(event);

    return this.sendEventImplementation(email, event);
  }

  sendEventImplementation() {
    throw new Error('Must implement the "sendEventImplementation" method.');
  }
}

module.exports = EventSenderEngine;

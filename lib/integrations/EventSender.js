'use strict';

const Promise = require('bluebird');

const {
  Assertion,
} = require('@funnelytics/utilities');

const EventSenderEngine = require('./event-sender/EventSenderEngine');

class EventSender {
  constructor({
    eventSenderEngine,
  }) {
    this.setEngine(eventSenderEngine);
    this.setEvents([]);
  }

  sendEvents(email) {
    return Promise.try(() => {
      Assertion.string(email);
      const events = this.getEvents();
      this.setEvents([]);

      return Promise.map(events, event => {
        return this.getEngine().sendEvent(email, event);
      });
    });
  }

  addEvent(event) {
    const currentEvents = this.getEvents();

    currentEvents.push(event);

    this.setEvents(currentEvents);
  }

  getEvents() {
    return this._events;
  }

  getEngine() {
    return this._engine;
  }

  setEvents(events) {
    Assertion.array(events);

    this._events = events;
  }

  setEngine(engine) {
    Assertion.instanceOf(engine, EventSenderEngine);

    this._engine = engine;
  }
}

module.exports = EventSender;

'use strict';

const Promise = require('bluebird');
const _ = require('lodash');
const {
  Assertion,
} = require('@funnelytics/utilities');

const SlackIntegration = require('../../../integrations/SlackIntegration');
const UpdateExternalServicesOptions = require('./post-webhook/UpdateExternalServicesOptions');
const Invoice = require('../objects/Invoice');
const EventSender = require('../../../integrations/EventSender');

class PostWebhookOptions {
  constructor({
    eventSender,
  }) {
    this._updateExternalServicesOptions = null;
    this._invoice = null;
    this.setEventSender(eventSender);
  }

  getEventSender() {
    return this._eventSender;
  }

  addEvent(event) {
    return this.getEventSender().addEvent(event);
  }

  getUserId() {
    return this._userId;
  }

  setUserId(userId) {
    Assertion.uuid(userId);

    this._userId = userId;
  }

  sendEvents(email) {
    return Promise.try(() => {
      Assertion.string(email);

      const eventsCopy = _.clone(this.getEventSender().getEvents());
      return Promise.try(() => {
        return this.getEventSender().sendEvents(email);
      }).catch(err => {
        const stringEvents = eventsCopy.map(eventName => {
          return `"${eventName}"`;
        }).join(', ');
        console.log(err);

        SlackIntegration.notifyForEvents({
          message: `Failure when sending the following events: ${stringEvents} for user with email "${email}" due to error: ${err.message}`,
        });
      });
    });
  }

  hasUpdateExternalServicesOptions() {
    return this.getUpdateExternalServicesOptions() !== null;
  }

  getExternalServiceType() {
    return this.getUpdateExternalServicesOptions().getExternalServiceType();
  }

  getUpdateExternalServicesOptions() {
    return this._updateExternalServicesOptions;
  }

  getExternalServicesToUpdate() {
    return this.getUpdateExternalServicesOptions().getExternalServicesToUpdate();
  }

  hasInvoice() {
    return this.getInvoice() !== null;
  }

  getInvoice() {
    return this._invoice;
  }

  setUpdateExternalServicesOptions(updateExternalServicesOptions) {
    Assertion.instanceOf(updateExternalServicesOptions, UpdateExternalServicesOptions);

    this._updateExternalServicesOptions = updateExternalServicesOptions;
  }

  setInvoice(invoice) {
    Assertion.instanceOf(invoice, Invoice);

    this._invoice = invoice;
  }

  setEventSender(eventSender) {
    Assertion.instanceOf(eventSender, EventSender);

    this._eventSender = eventSender;
  }
}

module.exports = PostWebhookOptions;

'use strict';

const {
  Assertion,
} = require('@funnelytics/utilities');

const Recurly = require('recurly-js/promise');
const _ = require('lodash');
const RecurlyUser = require('./users/RecurlyUser');
const RecurlyConfig = require('../../../../config/recurly/config');

const RecurlyLibrary = new Recurly(RecurlyConfig);

module.exports = class RecurlyWrapper {
  static getRecurlyUser(user) {
    return new RecurlyUser(RecurlyWrapper, user);
  }

  static getLibrary() {
    return RecurlyLibrary;
  }

  static getNormalizedItem(item) {
    if (_.isPlainObject(item)) {
      return [item];
    }
    return item;
  }

  static getUserIdFromAccountLink(account) {
    const accountHref = _.get(account, [
      '$',
      'href',
    ]);

    const beforeAccountString = '/accounts/';
    const beforeAccountStringIndex = accountHref.indexOf(beforeAccountString);
    const userIdFromLink = accountHref.slice(beforeAccountStringIndex + beforeAccountString.length);
    return RecurlyWrapper.normalizeUUID(userIdFromLink);
  }

  static normalizeUUID(uuid) {
    Assertion.string(uuid);

    const noDashUUID = uuid.replace(/-/g, '');

    const segments = [
      noDashUUID.slice(0, 8),
      noDashUUID.slice(8, 12),
      noDashUUID.slice(12, 16),
      noDashUUID.slice(16, 20),
      noDashUUID.slice(20, 32),
    ];

    const normalizedUuid = segments.join('-').trim();

    return normalizedUuid;
  }
};

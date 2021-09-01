'use strict';

const {
  Assertion,
} = require('@funnelytics/utilities');

class ConflictResponse {
  constructor({
    isInConflict,
    userString,
  }) {
    this.setIsInConflict(isInConflict);
    this.setUserString(userString);
  }

  static createEmpty(userId = '') {
    Assertion.string(userId, { allowEmpty: true });

    let userString = 'No user found';
    if (userId) {
      userString = `${userString}: ${userId}`;
    }

    return new ConflictResponse({
      isInConflict: false,
      userString,
    });
  }

  setIsInConflict(isInConflict) {
    Assertion.boolean(isInConflict);

    this._isInConflict = isInConflict;
  }

  isInConflict() {
    return this._isInConflict;
  }

  setUserString(userString) {
    Assertion.string(userString);

    this._userString = userString;
  }

  getUserString() {
    return this._userString;
  }
}

module.exports = ConflictResponse;

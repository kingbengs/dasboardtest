'use strict';

const _ = require('lodash');

const {
  Assertion,
} = require('@funnelytics/utilities');

class Helpers {
  static convertCommaSplitToUniqueArray(commaSplitList, maxLength = 0) {
    Assertion.string(commaSplitList, { allowEmpty: true });
    Assertion.integer(maxLength);

    const list = commaSplitList.split(',').map(value => {
      return value.trim();
    }).filter(item => {
      return !_.isEmpty(item);
    }).filter(item => {
      if (maxLength <= 0) {
        return true;
      }

      return item.length < maxLength;
    });

    return _.uniq(list);
  }
}

module.exports = Helpers;

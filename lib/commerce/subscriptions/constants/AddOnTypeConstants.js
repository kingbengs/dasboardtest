'use strict';

const {
  ConstantsProxy,
} = require('@funnelytics/utilities');

const AddOnTypeConstants = ConstantsProxy.create({
  TYPE_FIXED: 'fixed',
  TYPE_USAGE: 'usage',
});

module.exports = AddOnTypeConstants;

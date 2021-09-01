'use strict';

const {
  ConstantsProxy,
} = require('@funnelytics/utilities');

const EmailTemplateConstants = ConstantsProxy.create({
  // For new users to give them access to their log in credentials
  PRO_SESSIONS_PURCHASE_NEW: 'd-e668d46bdf7a482385711de1b32ca232',
  // For existing users to just give them information about their purchase
  PRO_SESSIONS_PURCHASE_EXISTING: 'd-6b3a845e24c648f4b8e0adbc15f09f7c',
});

module.exports = EmailTemplateConstants;

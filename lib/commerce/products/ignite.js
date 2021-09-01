const AWS = require('aws-sdk');
// eslint-disable-next-line global-require
const SES = new AWS.SES(require('aws-config')({
  accessKeyId: process.env.S3_ACCESS_KEY,
  secretAccessKey: process.env.S3_SECRET_KEY,
  region: 'us-west-2',
  apiVersion: '2010-12-01',
}));
const EmailHelper = require('../../../lib/emails/EmailHelper');

module.exports = class Ignite {
  static add(email) {
    return EmailHelper.send(
      process.env.ADMIN_EMAIL,
      'noresponse@funnelytics.io',
      'Funnel Ignite Registration',
      [
        `<p>${email} purchased Funnel Ignite</p>`,
      ].join(''),
    );
  }
};

const AWS = require('aws-sdk');
// eslint-disable-next-line global-require
const SES = new AWS.SES(require('aws-config')({
  accessKeyId: process.env.S3_ACCESS_KEY,
  secretAccessKey: process.env.S3_SECRET_KEY,
  region: 'us-west-2',
  apiVersion: '2010-12-01',
}));
const EmailHelper = require('../../../lib/emails/EmailHelper');

module.exports = class Template {
  static add(email) {
    return EmailHelper.send(
      email,
      'noresponse@funnelytics.io',
      '[Agency Ignite Templates]',
      [
        '<p>Hi,</p>',
        '<p>Thank you for purchasing our Agency Ignite Templates!</p>',
        '<p>In it you’ll have access to all of our video presentations, ads, proposals, call scripts, email campaigns, and contracts for you to easily fill in the blanks and use for your business</p>',
        '<p>You can download the zip file here: https://www.dropbox.com/s/gles9r00rt64ow4/Agency%20Ignite%20Templates.zip?dl=0</p>',
        '<p>The password: agencyignite</p>',
        '<p>Should you have any questions, please contact us directly at support@funnelytics.io</p>',
        '<p>Cheers,</br>Mikael</p>',
      ].join(''),
    );
  }
};

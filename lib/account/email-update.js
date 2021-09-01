'use strict';

const Bluebird = require('bluebird');

const {
  models: {
    dashboard: modelsDashboard,
  },
  errors,
} = require('@funnelytics/shared-data');
const moment = require('moment');
const EmailHelper = require('../emails/EmailHelper');

class EmailUpdater {
  static createNewUpdate({ userId, userNewEmail, firstName }, transacting) {
    const expiresAt = moment().add(1, 'days').toDate();
    const updateInput = {
      user: userId,
      new_email: userNewEmail,
      expires_at: expiresAt,
    };

    return Bluebird.try(() => {
      return modelsDashboard.EmailUpdate.getSchema().validateAsync(updateInput, {
        stripUnknown: true,
      });
    }).catch(err => {
      throw errors.fromJoi(err);
    }).then(validatedInput => {
      return modelsDashboard.EmailUpdate.forge().save(validatedInput, {
        transacting,
        returning: ['id', 'new_email'],
      });
    }).then(emailUpdate => {
      const link = `${process.env.APP_URL}/dashboard/settings/account?email-update=${emailUpdate.get('id')}`;
      return EmailHelper.send(
        emailUpdate.get('new_email'),
        'noresponse@funnelytics.io',
        'Funnelytics Email Update Request', [
          `<p>Hey${firstName ? `, ${firstName}` : ''}!</p> `,
          `<p>Someone (hopefully you) requested to change your email to this one. If you'd like to continue with this request, <a href="${link}">click here</a></p>`,
          `<p>In case you're unable to click that link, go here: ${link}</p>`,
          '<p>This link will expire in 24 hours.</p>',
        ].join(''),
      ).then(() => {
        return emailUpdate;
      });
    });
  }

  static confirmUpdate({ emailUpdate, user }, transacting) {
    return emailUpdate.save({ used: true }, { transacting, patch: true })
      .then(updatedEmail => {
        const firstName = user.get('first_name');
        return EmailHelper.send(
          updatedEmail.get('new_email'),
          'noresponse@funnelytics.io',
          'Funnelytics Email Updated',
          [
            `<p>Hey${firstName ? `, ${firstName}` : ''}!</p> `,
            '<p>This email is sent to confirm that your request to change your email to this address has been fulfilled.</p>',
            '<p>From now on, communications from Funnelytics will be sent to this email address.</p>',
          ].join(''),
        ).then(() => {
          return updatedEmail;
        });
      });
  }
}

module.exports = EmailUpdater;

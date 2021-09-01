const express = require('express');
const _ = require('lodash');

const router = express.Router();
const {
  models: {
    dashboard: modelsDashboard,
  },
  databases: {
    dashboard: BookshelfDashboard,
  },
  errors: { AppError, predefined: predefinedErrors },
  serializer: JSONAPI,
} = require('@funnelytics/shared-data');
const Promise = require('bluebird');
const request = require('request-promise');
const moment = require('moment');
const { compareSync } = require('bcryptjs');

// const DripIntegration = require('../lib/integrations/Drip');
const EmailUpdater = require('../lib/account/email-update');
const SubscriptionsManager = require('../lib/commerce/subscriptions/SubscriptionsManager');
const RecurlyManagerEngine = require('../lib/commerce/subscriptions/manager-engines/RecurlyManagerEngine');

const EXPIRED_TOKEN = 'Expired Token';
const USED_TOKEN = 'Used Token';

router.get('/:id', (req, res, next) => {
  return BookshelfDashboard.transaction(transacting => {
    return modelsDashboard.EmailUpdate
      .forge()
      .where({
        id: req.params.id,
        user: req.user.id,
      }).fetch({
        require: true,
        transacting,
        columns: ['id', 'expires_at', 'new_email', 'used'],
      });
  }).then(emailUpdate => {
    const expired = moment().isAfter(emailUpdate.get('expires_at'));
    if (expired || emailUpdate.get('used')) {
      emailUpdate.unset('new_email'); // hide details
    }

    return JSONAPI.serializeAsync('email-update', emailUpdate.toJSON());
  }).then(emailUpdate => {
    return res.json(emailUpdate);
  }).catch(err => {
    return next(err);
  });
});

router.patch('/:id', (req, res, next) => {
  let userId;
  return Promise.try(() => {
    return BookshelfDashboard.transaction(async transacting => {
      const oldEmail = (await modelsDashboard.User.forge().where({
        id: req.user.id,
      }).fetch({
        columns: ['email'],
        transacting,
      })).get('email');

      return Promise.all([
        oldEmail,
        modelsDashboard.EmailUpdate
          .forge()
          .where({
            id: req.params.id,
            user: req.user.id,
          })
          .fetch({
            transacting,
            columns: ['id', 'expires_at', 'new_email', 'used', 'user'],
            withRelated: ['user'],
          }).tap(emailUpdate => {
            if (!emailUpdate) {
              throw predefinedErrors.generic.unauthorized;
            }

            const expired = moment().isAfter(emailUpdate.get('expires_at'));
            if (expired) {
              throw new AppError(410, EXPIRED_TOKEN, 'This token has expired and cannot be used, please request a new email change.');
            }
            if (emailUpdate.get('used')) {
              throw new AppError(410, USED_TOKEN, 'This token has already been used and is invalid, please request a new email change.');
            }
            if (!compareSync(req.body.password, emailUpdate.related('user').get('password') || '')) {
              throw predefinedErrors.generic.unauthorized;
            }

            userId = emailUpdate.related('user').get('id');

            return modelsDashboard.User
              .forge()
              .where('id', userId)
              .save({ email: emailUpdate.get('new_email') }, { transacting, patch: true }).catch(err => {
                if (_.get(err, 'constraint') === 'users_email_unique') {
                  throw predefinedErrors.generic.unauthorized;
                }
                throw err;
              });
          }).tap(emailUpdate => {
            const recurlyManagerEngine = new RecurlyManagerEngine(userId);
            const manager = new SubscriptionsManager(recurlyManagerEngine);

            return manager.updateAccountAsync({
              email: emailUpdate.get('new_email'),
            });
          }).tap(emailUpdate => {
            return EmailUpdater.confirmUpdate({
              emailUpdate,
              user: emailUpdate.related('user'),
            }, transacting);
          }),
      ]);
    }).then(result => {
      const [
        oldEmail,
        emailUpdate,
      ] = result;

      // Update email when sending response object back:
      emailUpdate.related('user').set('email', emailUpdate.get('new_email'));
      return [oldEmail, emailUpdate];
    }).then(result => {
      const [
        oldEmail,
        emailUpdate,
      ] = result;

      request({
        method: 'GET',
        url: 'https://hooks.zapier.com/hooks/catch/4725612/otvv67q',
        json: true,
        body: {
          type: 'change_email',
          old_email: oldEmail,
          new_email: emailUpdate.get('new_email'),
        },
      });
      return JSONAPI.serializeAsync('email-update', emailUpdate.toJSON());
    }).then(emailUpdate => {
      return res.json(emailUpdate);
    });
  }).catch(err => {
    return next(err);
  });
});


module.exports = router;

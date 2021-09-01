const express = require('express');

const router = express.Router();
const {
  serializer: JSONAPI,
  errors,
  models: {
    dashboard: modelsDashboard,
  },
  databases: {
    dashboard: BookshelfDashboard,
  },
} = require('@funnelytics/shared-data');

const Promise = require('bluebird');
const bcrypt = require('bcryptjs');

const hash = Promise.promisify(bcrypt.hash);
const _ = require('lodash');
const uuid = require('uuid/v4');
const EmailHelper = require('../lib/emails/EmailHelper');

// POST /, /create
router.post(['/', '/create'], (req, res, next) => {
  return Promise.try(() => {
    req.body = JSONAPI.deserialize('password_reset', req.body);

    if (EmailHelper.isBlacklisted(req.body.email.toLowerCase())) {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          reject(new Error(`Couldn't create password reset for user with email ${req.body.email.toLowerCase()}. This email has been blacklisted.`));
        }, Math.floor(1500 + Math.random() * 3000));
      });
    }

    return BookshelfDashboard.transaction(t => {
      return Promise.props({
        reset: modelsDashboard.PasswordReset.forge().save({
          email: req.body.email.toLowerCase(),
          key: uuid(),
        }, {
          transacting: t,
        }),
        user: modelsDashboard.User.forge().where({
          email: req.body.email.toLowerCase(),
        }).fetch({
          transacting: t,
          columns: ['first_name', 'email'],
        }),
      });
    }).then(props => {
      if (!props.user) {
        throw errors.predefined.generic.nonexistent;
      }
      const link = `${process.env.APP_URL}/reset/${props.reset.get('key')}`;
      const firstName = props.user.get('first_name');
      return EmailHelper.send(
        props.user.get('email'),
        'noresponse@funnelytics.io',
        'Reset Your Funnelytics Password',
        [
          `<p>Hey${firstName ? `, ${firstName}` : ''}!</p> `,
          `<p>Someone (hopefully you) requested to reset your password. If you'd like to continue with this request, <a href="${link}">click here</a></p>`,
          `<p>In case you're unable to click that link, go here: ${link}</p>`,
        ].join(''),
      ).then(() => {
        return props.reset;
      });
    }).then(reset => {
      return JSONAPI.serializeAsync('password_reset', _.omit(reset.toJSON(), [
        'key',
      ]));
    }).then(body => {
      return res.status(201).json(body);
    });
  }).catch(err => {
    return next(err);
  });
});

// GET /:key, /find/:key
router.get(['/:key', '/find/:key'], (req, res, next) => {
  return modelsDashboard.PasswordReset.forge().where({
    key: req.params.key,
  }).fetch().then(reset => {
    if (!reset) {
      throw errors.predefined.generic.nonexistent;
    }
    return JSONAPI.serializeAsync('password_reset', reset.toJSON());
  }).then(body => {
    return res.json(body);
  }).catch(err => {
    return next(err);
  });
});

// PATCH /:key, /edit/:key
router.patch(['/:key', '/edit/:key'], (req, res, next) => {
  req.body = JSONAPI.deserialize('password_reset', req.body);
  return BookshelfDashboard.transaction(t => {
    return modelsDashboard.PasswordReset.forge().where({
      key: req.params.key,
      used: false,
    }).save({
      used: true,
    }, {
      transacting: t,
      patch: true,
      returning: '*',
    }).tap(reset => {
      return hash(req.body.password, 12).then(password => {
        return modelsDashboard.User.forge().where({
          email: reset.get('email'),
        }).save({
          password,
        }, {
          transacting: t,
          patch: true,
        });
      });
    });
  }).then(reset => {
    return JSONAPI.serializeAsync('password_reset', reset.toJSON());
  }).then(body => {
    return res.status(201).json(body);
  }).catch(err => {
    return next(err);
  });
});

module.exports = router;

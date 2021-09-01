'use strict';

const {
  models: {
    dashboard: modelsDashboard,
  },
  errors,
} = require('@funnelytics/shared-data');

const bcrypt = require('bcryptjs');
const Bluebird = require('bluebird');
const _ = require('lodash');
const request = require('request-promise');

const EmailHelper = require('../emails/EmailHelper');

const hash = Bluebird.promisify(bcrypt.hash);

class UserCreator {
  constructor(userBody) {
    this.setBody(userBody);
  }

  setBody(userBody) {
    this._userBody = userBody;
  }

  getBody() {
    return _.omit(this._userBody, ['recaptcha_token']);
  }

  getRecaptchaToken() {
    return _.get(this._userBody, 'recaptcha_token', null);
  }

  create(
    {
      ip: userIP = null,
      transacting,
      onlyByEmail = false,
    } = {},
    bypassRecaptcha = process.env.NODE_ENV === 'development',
  ) {
    if (process.env.IS_VIP === 'true') {
      return errors.predefined.generic.forbidden;
    }

    return Bluebird.try(async () => {
      const userEmail = _.get(this.getBody(), 'email');
      const userPassword = _.get(this.getBody(), 'password');

      if (bypassRecaptcha === false && !await UserCreator.isValidRecaptcha(this.getRecaptchaToken(), {
        email: userEmail,
      })) {
        return Promise.reject(new errors.AppError(
          403,
          'Must Pass ReCAPTCHA',
          'You must be able to pass ReCAPTCHA before registering.',
        ));
      }

      if (EmailHelper.isBlacklisted(userEmail)) {
        return new Bluebird((resolve, reject) => {
          setTimeout(() => {
            reject(new Error(`Couldn't create user with email ${userEmail}. This email has been blacklisted.`));
          }, Math.floor(1500 + Math.random() * 3000));
        });
      }

      return Bluebird.try(() => {
        return modelsDashboard.User.getSchema(onlyByEmail).validateAsync(this.getBody(), {
          stripUnknown: true,
        });
      }).catch(err => {
        throw errors.fromJoi(err);
      }).then(body => {
        return Bluebird.props({
          body,
          count: modelsDashboard.User.forge().where({
            email: body.email,
          }).count({
            transacting,
          }),
        });
      }).then(result => {
        if (result.count > 0) {
          throw errors.predefined.users.exists;
        }
        return result.body;
      }).then(body => {
        return Bluebird.props({
          body,
          hash: onlyByEmail ? null : hash(userPassword, 12),
        });
      }).then(result => {
        const bodyToSave = _.omit(result.body, ['password']);
        const passwordHash = onlyByEmail ? {} : { password: result.hash };

        return modelsDashboard.User.forge(bodyToSave).save(passwordHash, {
          transacting,
          returning: ['id', 'email'],
        });
      }).tap(async user => {
        const project = await modelsDashboard.Project.forge().save({
          name: 'My Site',
          user: user.get('id'),
          tracking: true,
        }, {
          transacting,
        });
        return modelsDashboard.Funnel.forge().save({
          name: 'My Funnel',
          user: user.get('id'),
          project: project.get('id'),
          is_private: true,
        }, {
          transacting,
        });
      }).then(user => {
        return Bluebird.props({
          user: modelsDashboard.User.forge().where('id', user.get('id')).fetch({
            withRelated: ['funnels'],
            transacting,
          }),
          projects: modelsDashboard.ProjectClient.forge().where({
            email: user.get('email'),
          }).save({
            user: user.get('id'),
          }, {
            transacting,
            patch: true,
            method: 'update',
            require: false,
          }),
        });
      }).then(({ user }) => {
        const utmSource = _.get(this.getBody(), 'utm_source');
        const utmMedium = _.get(this.getBody(), 'utm_medium');
        const utmCampaign = _.get(this.getBody(), 'utm_campaign');
        const utmContent = _.get(this.getBody(), 'utm_content');
        const utmTerm = _.get(this.getBody(), 'utm_term');

        const hubspotParams = {
          properties: [
            {
              property: 'funnelytics_user_id',
              value: user.get('id'),
            },
            {
              property: 'email',
              value: user.get('email'),
            },
            {
              property: 'firstname',
              value: user.get('first_name'),
            },
            {
              property: 'lastname',
              value: user.get('last_name'),
            },
            {
              property: 'phone',
              value: user.get('phone'),
            },
            {
              property: 'utm_source',
              value: utmSource,
            },
            {
              property: 'utm_medium',
              value: utmMedium,
            },
            {
              property: 'utm_campaign',
              value: utmCampaign,
            },
            {
              property: 'utm_content',
              value: utmContent,
            },
            {
              property: 'utm_term',
              value: utmTerm,
            },
          ],
        };
        if (userIP) {
          _.set(hubspotParams, 'ip_city', userIP);
        }

        request({
          method: 'POST',
          url: 'https://api.hubapi.com/contacts/v1/contact/',
          json: true,
          body: hubspotParams,
          qs: {
            hapikey: process.env.HUBSPOT_API_KEY,
          },
        });

        return user;
      });
    });
  }

  static async isValidRecaptcha(token, options = {}) {
    const secret = process.env.RECAPTCHA_SECRET;

    const response = await request({
      method: 'POST',
      url: `https://www.google.com/recaptcha/api/siteverify?secret=${secret}&response=${token}`,
      json: true,
    });
    const success = _.get(response, 'success', false);
    const score = _.get(response, 'score', 0);

    if (score <= 0.3 || success === false) {
      EmailHelper.send(
        'aglazunov@funnelytics.io',
        'noresponse@funnelytics.io',
        'User failed ReCAPTCHA',
        [
          `Email: ${_.get(options, 'email')}`,
          `Score: ${score}`,
          `Success: ${success}`,
        ].map(line => {
          return `<p>${line}</p>`;
        }).join(''),
      );
    }

    if (!success) {
      return false;
    }

    // ReCAPTCHA score is from 0.0 to 1.0
    return score > 0.3;
  }
}

module.exports = UserCreator;

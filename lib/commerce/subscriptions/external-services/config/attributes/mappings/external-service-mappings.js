'use strict';

const Promise = require('bluebird');
const request = require('request-promise');
const {
  databases: {
    dashboard: BookshelfDashboard,
  },
  models: {
    dashboard: modelsDashboard,
  },
  uuid: {
    ExternalProductIdentifier,
  },
} = require('@funnelytics/shared-data');

const Thinkific = require('../../../../../third-party/education/Thinkific');
const EmailHelper = require('../../../../../../emails/EmailHelper');
const ThinkificCourseConstants = require('./constants/ThinkificCourseConstants');
const ThinkificEmailTemplateConstants = require('./constants/ThinkificEmailTemplateConstants');

const mappings = {
  [ExternalProductIdentifier.QUICK_WINS](ExternalServiceMappingClass) {
    return new ExternalServiceMappingClass({
      id: ExternalProductIdentifier.QUICK_WINS,
      activationMethod(userId) {
        return BookshelfDashboard.transaction(transacting => {
          const thinkific = new Thinkific(userId);
          return thinkific.addTo(ThinkificCourseConstants.QUICK_WINS, {
            transacting,
          }).then(() => {
            return modelsDashboard.User.forge().where({
              id: userId,
            }).fetch({
              transacting,
              columns: ['email'],
            });
          }).then(user => {
            EmailHelper.sendTemplate(
              user.get('email'),
              'support@funnelytics.io',
              null,
              ThinkificEmailTemplateConstants.QUICK_WINS,
            );
            return user;
          });
        });
      },
      terminationMethod(userId) {
        return Promise.try(() => {
          return userId;
        });
      },
    });
  },

  [ExternalProductIdentifier.IGNITE_TEMPLATES](ExternalServiceMappingClass) {
    return new ExternalServiceMappingClass({
      id: ExternalProductIdentifier.IGNITE_TEMPLATES,
      activationMethod(userId) {
        return BookshelfDashboard.transaction(transacting => {
          const thinkific = new Thinkific(userId);
          return thinkific.addTo(ThinkificCourseConstants.IGNITE_TEMPLATES, {
            transacting,
          }).then(() => {
            return modelsDashboard.User.forge().where({
              id: userId,
            }).fetch({
              transacting,
              columns: ['email'],
            });
          }).then(user => {
            EmailHelper.sendTemplate(
              user.get('email'),
              'support@funnelytics.io',
              null,
              ThinkificEmailTemplateConstants.IGNITE_TEMPLATES,
            );
            return user;
          });
        });
      },
      terminationMethod(userId) {
        return Promise.try(() => {
          return userId;
        });
      },
    });
  },

  [ExternalProductIdentifier.FUNNELYTICS_MASTERY](ExternalServiceMappingClass) {
    return new ExternalServiceMappingClass({
      id: ExternalProductIdentifier.FUNNELYTICS_MASTERY,
      activationMethod(userId) {
        return BookshelfDashboard.transaction(transacting => {
          const thinkific = new Thinkific(userId);
          return thinkific.addTo(ThinkificCourseConstants.FUNNELYTICS_MASTERY, {
            transacting,
          }).then(() => {
            return modelsDashboard.User.forge().where({
              id: userId,
            }).fetch({
              transacting,
              columns: ['email'],
            });
          }).then(user => {
            EmailHelper.sendTemplate(
              user.get('email'),
              'support@funnelytics.io',
              null,
              ThinkificEmailTemplateConstants.FUNNELYTICS_MASTERY,
            );
            return user;
          });
        });
      },
      terminationMethod(userId) {
        return Promise.try(() => {
          return userId;
        });
      },
    });
  },

  [ExternalProductIdentifier.MASTERY_AND_CERTIFICATION](ExternalServiceMappingClass) {
    return new ExternalServiceMappingClass({
      id: ExternalProductIdentifier.MASTERY_AND_CERTIFICATION,

      activationMethod(user) {
        const thinkific = new Thinkific(user);

        return BookshelfDashboard.transaction(transacting => {
          return Promise.all([
            thinkific.addTo(ThinkificCourseConstants.FUNNELYTICS_MASTERY, {
              transacting,
            }),
            
            BookshelfDashboard.knex.raw(
              `
                SELECT
                  u.id,
                  u.email,
                  u.first_name,
                  u.last_name
                FROM users u
                WHERE u.id = ?;
              `,
              [
                user,
              ],
            ).then(result => {
              const row = result.rows[0];
    
              return request({
                method: 'GET',
                url: 'https://hooks.zapier.com/hooks/catch/4725612/o5y5gh9/',
                json: true,
                body: {
                  first_name: row.first_name || '',
                  last_name: row.last_name || '',
                  email: row.email,
                  funnelytics_id: row.id,
                },
              });
            }),
          ]);
        });
      },

      terminationMethod(user) {
        return Promise.try(() => {
          return user;
        });
      },
    });
  },

  [ExternalProductIdentifier.SETUP_W_VIP_CALLS](ExternalServiceMappingClass) {
    return new ExternalServiceMappingClass({
      id: ExternalProductIdentifier.SETUP_W_VIP_CALLS,

      activationMethod(user) {
        return BookshelfDashboard.knex.raw(
          `
            SELECT
              u.id,
              u.email,
              u.first_name,
              u.last_name
            FROM users u
            WHERE u.id = ?;
          `,
          [
            user,
          ],
        ).then(result => {
          const row = result.rows[0];

          return request({
            method: 'GET',
            url: 'https://hooks.zapier.com/hooks/catch/4725612/o5y5zo2/',
            json: true,
            body: {
              first_name: row.first_name || '',
              last_name: row.last_name || '',
              email: row.email,
              funnelytics_id: row.id,
            },
          });
        });
      },

      terminationMethod(user) {
        return Promise.try(() => {
          return user;
        });
      },
    });
  },
};

module.exports = mappings;

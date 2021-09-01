'use strict';

const _ = require('lodash');
const request = require('request-promise');
const {
  models: {
    dashboard: modelsDashboard,
  },
} = require('@funnelytics/shared-data');

module.exports = class Thinkific {
  constructor(user) {
    this.user = user.toLowerCase();
  }

  create(options = {}) {
    return modelsDashboard.User.forge().where({
      id: this.user,
    }).fetch({
      columns: ['first_name', 'last_name', 'email'],
      transacting: options.transacting,
    }).then(user => {
      return request({
        method: 'POST',
        url: 'https://api.thinkific.com/api/public/v1/users',
        headers: Thinkific.getHTTPHeaders(),
        body: {
          external_id: this.user,
          first_name: user.get('first_name') || '',
          last_name: user.get('last_name') || '',
          email: user.get('email'),
          send_welcome_email: true,
        },
        json: true,
      });
    });
  }

  get(options = {}) {
    return modelsDashboard.User.forge().where({
      id: this.user,
    }).fetch({
      columns: ['email'],
      transacting: options.transacting,
    }).then(user => {
      const convertedEmail = encodeURIComponent(user.get('email'));
      return request({
        method: 'GET',
        url: `https://api.thinkific.com/api/public/v1/users/?query[email]=${convertedEmail}`,
        headers: Thinkific.getHTTPHeaders(),
        json: true,
      });
    }).then(res => {
      return res.items[0] || null;
    });
  }

  addTo(course, options = {}) {
    return this.get(options).then(user => {
      if (!user) {
        return this.create(options);
      }
      return user;
    }).then(user => {
      return request({
        method: 'POST',
        url: 'https://api.thinkific.com/api/public/v1/enrollments',
        headers: Thinkific.getHTTPHeaders(),
        body: {
          course_id: course,
          user_id: user.id,
          activated_at: new Date().toISOString(),
        },
        json: true,
      });
    });
  }

  static getHTTPHeaders() {
    return {
      'X-Auth-API-Key': process.env.THINKIFIC_API_KEY,
      'X-Auth-Subdomain': process.env.THINKIFIC_SUBDOMAIN,
    };
  }
};

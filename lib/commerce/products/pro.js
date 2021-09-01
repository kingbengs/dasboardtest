const {
  models: {
    dashboard: modelsDashboard,
  },
} = require('@funnelytics/shared-data');
const EmailHelper = require('../../../lib/emails/EmailHelper');

const Memberships = requireRoot('/constants/memberships');

module.exports = class Pro {
  static add(email, { transacting = null }) {
    const promises = [];
    promises.push(
      modelsDashboard.User.forge().where({
        email,
      }).save({
        membership: Memberships.Pro,
        founding_member: true,
      }, {
        transacting,
        patch: true,
      }),
    );

    promises.push(
      EmailHelper.send(
        email,
        'noresponse@funnelytics.io',
        'Welcome to Funnelytics Pro!',
        [
          '<p>Here’s what you should do next:</p>',
          '<ol>',
          '<li>Join the Behind The Scenes of Funnelytics™ Facebook Group here: <a href="https://www.facebook.com/groups/btsfunnelytics/">https://www.facebook.com/groups/btsfunnelytics/</a> and introduce yourself</li>', // eslint-disable-line max-len
          '<li class="mt-3">Watch the Analytics “Getting Started” Tutorial here: <a href="http://help.funnelytics.io/getting-started/getting-started-with-analytics">http://help.funnelytics.io/getting-started/getting-started-with-analytics</a></li>', // eslint-disable-line max-len
          '<li>Get access to the Zero to $200K training here: https://www.facebook.com/mikael.dia/videos/10102027683215101/ (you need to join the group to access)</li>', // eslint-disable-line max-len
          '<li class="mt-3">Start using the Analytics feature by logging into your dashboard</li>',
          '</ol>',
        ].join(''),
      ),
    );

    return Promise.all(promises);
  }

  static remove(email, opts = {}) {
    return modelsDashboard.User.forge().where({
      email,
    }).save({
      membership: Memberships.Starter,
      founding_member: false,
    }, {
      transacting: opts.transacting,
      patch: true,
    });
  }
};

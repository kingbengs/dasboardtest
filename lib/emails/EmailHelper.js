const sgMail = require('@sendgrid/mail');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

module.exports = class EmailHelper {
  static send(to, from, subject, html, cc) {
    if (EmailHelper.isBlacklisted(to)) {
      return new Promise((resolve, reject) => {
        return reject(new Error('Du bist scheiße.'));
      });
    }
    return sgMail.send({
      to,
      from,
      subject,
      html,
      cc,
    });
  }

  static sendTemplate(to, from, subject, template, substitutions = {}) {
    if (EmailHelper.isBlacklisted(to)) {
      return new Promise((resolve, reject) => {
        return reject(new Error('Du bist scheiße.'));
      });
    }
    const data = {
      to,
      from: {
        email: from,
        name: 'Funnelytics',
      },
      template_id: template,
      dynamic_template_data: substitutions,
    };
    if (subject) {
      data.subject = subject;
    }
    return sgMail.send(data);
  }

  static isBlacklisted(email = '') {
    const domain = email.split('@')[1];
    const blacklisted = [
      'qq.com',
    ];
    return blacklisted.indexOf(domain) !== -1;
  }
};

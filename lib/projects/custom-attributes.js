const {
  models: {
    dashboard: modelsDashboard,
  },
} = require('@funnelytics/shared-data');

const AWS = require('aws-sdk');
// eslint-disable-next-line global-require
const S3 = new AWS.S3(require('aws-config')({
  accessKeyId: process.env.S3_ACCESS_KEY,
  secretAccessKey: process.env.S3_SECRET_KEY,
}));

const getLogoUrl = async (projectId, transacting) => {
  const customAttributes = await modelsDashboard.ProjectCustomAttribute.forge().where({
    project: projectId,
  }).fetch({
    transacting,
  });

  if (!customAttributes || !customAttributes.get('logo')) {
    return null;
  }

  return new Promise(resolve => {
    S3.getSignedUrl(
      'getObject',
      {
        Bucket: process.env.S3_PROJECT_LOGOS_BUCKET,
        Key: customAttributes.get('logo'),
      },
      (err, data) => {
        if (err) {
          return resolve(null);
        }
        return resolve(data);
      },
    );
  });
};

const issueLogoUrl = key => {
  return new Promise((resolve, reject) => {
    S3.getSignedUrl('putObject', {
      Bucket: process.env.S3_PROJECT_LOGOS_BUCKET,
      Key: key,
      ACL: 'authenticated-read',
      ContentType: 'binary/octet-stream',
    }, (err, data) => {
      if (err) {
        return reject(err);
      }
      return resolve(data);
    });
  });
};

module.exports = {
  getLogoUrl,
  issueLogoUrl,
};

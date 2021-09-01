const Promise = require('bluebird');
const _ = require('lodash');
const moment = require('moment');
const util = require('util');
const fs = require('fs');
const tmp = require('tmp');
const s3 = require('s3').createClient({
  s3Options: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
    region: 'us-west-2',
  },
});

module.exports = {
  _bucket: process.env.S3_FUNNELS_BUCKET || 'funnelytics-dev',

  _filePath: 'funnels/%s/%s/%s.json',

  _formatPath(timestamp, organization, funnel) {
    return util.format(this._filePath,
      timestamp,
      organization,
      funnel);
  },

  _formatTimestamp(timestamp) {
    return moment(timestamp).format('MMDDYYYY');
  },

  save(content, organization, funnel, revision) {
    return new Promise((resolve, reject) => {
      const _this = this;
      tmp.file((err, path, fd, cleanup) => {
        if (err) {
          cleanup();
          return reject(err);
        }
        fs.write(fd, JSON.stringify(content), 0, 'utf8', (err, bytes, str) => {
          if (err) {
            cleanup();
            return reject(err);
          }
          const upload = s3.uploadFile({
            localFile: path,
            s3Params: {
              Bucket: _this._bucket,
              Key: _this._formatPath(organization, funnel, revision),
            },
          });
          upload.on('error', err => {
            cleanup();
            return reject(err);
          });
          upload.on('end', output => {
            cleanup();
            return resolve(output);
          });
        });
      });
    });
  },

  retrieve(organization, funnel, revision) {
    return new Promise((resolve, reject) => {
      const _this = this;
      const path = tmp.tmpNameSync();
      const download = s3.downloadFile({
        localFile: path,
        s3Params: {
          Bucket: _this._bucket,
          Key: _this._formatPath(organization, funnel, revision),
        },
      });
      download.on('error', err => {
        fs.unlink(path, () => reject(err));
      });
      download.on('end', () => {
        fs.readFile(path, 'utf8', (err, data) => {
          if (err) {
            return reject(err);
          }
          fs.unlink(path, () => resolve(JSON.parse(data)));
        });
      });
    });
  },
};

const express = require('express');
const _ = require('lodash');
const Promise = require('bluebird');
const {
  models: {
    dashboard: modelsDashboard,
  },
  databases: {
    dashboard: BookshelfDashboard,
  },
} = require('@funnelytics/shared-data');

const router = express.Router();

router.post('/', (req, res, next) => {
  return BookshelfDashboard.transaction(transacting => {
    return modelsDashboard.DowngradeComment.forge({
      user: req.user.id,
      details: req.body.comments,
    }).save(null, {
      transacting,
    }).then(result => {
      const reasons = _.reduce(req.body.reasons, (obj, value, key) => {
        if (value === 'true') {
          obj[key] = value;
        }
        return obj;
      }, {});
      return Promise.map(_.keys(reasons), reason => {
        return modelsDashboard.DowngradeCommentReason.forge({
          comment: result.id,
          reason,
        }).save(null, {
          transacting,
        });
      });
    });
  }).then(() => {
    return res.status(200).json({});
  }).catch(err => {
    return next(err);
  });
});

module.exports = router;

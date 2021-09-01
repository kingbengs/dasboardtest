const express = require('express');

const router = express.Router();

const {
  serializer: JSONAPI,
  models: {
    tracking: modelsTracking,
  },
} = require('@funnelytics/shared-data');

// GET /, /find
router.get(['/', '/find'], (req, res, next) => {
  return modelsTracking.TrackerProfileAttribute.forge().where(req.query.filter || {}).query(qb => {
    qb.whereIn('profile', function () {
      this.select('tracker_sessions.profile').from('tracker_sessions');
      this.join('projects', 'tracker_sessions.project', 'projects.id');
      this.where('projects.user', req.user.id);
    });
  }).fetchAll({
    withRelated: req.query.include || [],
  })
    .then(attributes => { return JSONAPI.serializeAsync('tracker-profile-attribute', attributes.toJSON()); })
    .then(body => { return res.json(body); })
    .catch(err => { return next(err); });
});

module.exports = router;

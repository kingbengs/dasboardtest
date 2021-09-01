const express = require('express');

const router = express.Router();

const {
  serializer: JSONAPI,
  errors,
  models: {
    tracking: modelsTracking,
  },
  databases: {
    tracking: BookshelfTracking,
  },
} = require('@funnelytics/shared-data');

// GET /, /find
router.get(['/', '/find'], (req, res, next) => {
  return modelsTracking.TrackerProfile.forge().where(req.query.filter || {}).query(qb => {
    qb.whereIn('id', function () {
      this.select('tracker_sessions.profile').from('tracker_sessions');
      this.join('projects', 'tracker_sessions.project', 'projects.id');
      this.where('projects.user', req.user.id);
    });
  }).fetchAll({
    withRelated: req.query.include || [],
  })
    .then(profiles => { return JSONAPI.serializeAsync('tracker-profile', profiles.toJSON()); })
    .then(body => { return res.json(body); })
    .catch(err => { return next(err); });
});

// GET /:id, /find/:id
router.get(['/:id', '/find/:id'], (req, res, next) => {
  return modelsTracking.TrackerProfile.forge({
    id: req.params.id,
  }).where(req.query.filter || {}).query(qb => {
    qb.whereIn('id', function () {
      this.select('tracker_sessions.profile').from('tracker_sessions');
      this.leftJoin('projects', 'tracker_sessions.project', 'projects.id');
      this.where('projects.user', req.user.id);
    });
  }).fetch({
    withRelated: req.query.include || [],
  })
    .then(profile => {
      if (!profile) {
        throw errors.predefined.generic.nonexistent;
      }
      return JSONAPI.serializeAsync('tracker-profile', profile.toJSON());
    })
    .then(body => { return res.json(body); })
    .catch(err => { return next(err); });
});

// DELETE /:id, /delete/:id
router.delete(['/:id', '/delete/:id'], (req, res, next) => {
  return modelsTracking.TrackerProfile.forge().query(qb => {
    qb.whereIn('id', function () {
      this.select('tracker_sessions.profile').from('tracker_sessions');
      this.join('projects', 'tracker_sessions.project', 'projects.id');
      this.where('projects.user', req.user.id);
    });
    qb.where('id', req.params.id);
  }).destroy().then(profiles => { return JSONAPI.serializeAsync('tracker-profile', profiles.toJSON()); })
    .then(body => { return res.json(body); })
    .catch(err => { return next(err); });
});

// POST /anonymize/:id
router.post('/anonymize/:id', (req, res, next) => {
  return BookshelfTracking.transaction(transacting => {
    return modelsTracking.TrackerProfile.forge().query(qb => {
      qb.whereIn('id', function () {
        this.select('tracker_sessions.profile').from('tracker_sessions');
        this.join('projects', 'tracker_sessions.project', 'projects.id');
        this.where('projects.user', req.user.id);
      });
      qb.where('id', req.params.id);
    }).fetch({
      transacting,
    }).tap(profile => {
      return modelsTracking.TrackerProfileAttribute.forge().where({
        profile: profile.get('id'),
      }).destroy({
        transacting,
      });
    });
  }).then(body => { return res.json(body); }).catch(err => { return next(err); });
});

module.exports = router;

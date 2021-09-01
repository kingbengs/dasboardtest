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
// router.get(['/', '/find'], (req, res, next) => {
//   Bookshelf.transaction(t => {
//     return models.User.forge({
//       id: req.user.id,
//     }).fetch({
//       transacting: t,
//       columns: ['id'],
//     }).then(user => {
//       return models.TrackerStep.forge().orderBy('created_at', 'DESC').where(req.query.filter || {}).query(qb => {
//         qb.whereIn('session', function () {
//           this.select('id').from('tracker_sessions').whereIn('funnel', function () {
//             this.select('id').from('funnels').where('organization', user.get('organization'));
//           });
//         });
//       })
//         .fetchAll({
//           transacting: t,
//           withRelated: req.query.include || [],
//         });
//     });
//   }).then(funnels => { return JSONAPI.serializeAsync('tracker-step', funnels.toJSON()); }).then(body => { return res.json(body); }).catch(err => { return next(err); });
// });

// GET /:id, /find/:id
// router.get(['/:id', '/find/:id'], (req, res, next) => {
//   Bookshelf.transaction(t => {
//     return models.User.forge({
//       id: req.user.id,
//     }).fetch({
//       transacting: t,
//       columns: ['organization'],
//     }).then(user => {
//       return models.TrackerSession.forge({
//         id: req.params.id,
//       }).where({
//         organization: user.get('organization'),
//       }).fetch({
//         transacting: t,
//         withRelated: req.query.include || [],
//       });
//     });
//   }).then(funnel => {
//     if (!funnel) {
//       throw errors.predefined.generic.nonexistent;
//     }
//     return JSONAPI.serializeAsync('tracker-step', funnel.toJSON());
//   }).then(body => { return res.json(body); }).catch(err => { return next(err); });
// });

module.exports = router;

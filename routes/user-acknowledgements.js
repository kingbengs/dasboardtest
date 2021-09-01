'use strict';

const express = require('express');
const Promise = require('bluebird');
const _ = require('lodash');
const {
  databases: {
    dashboard: BookshelfDashboard,
  },
  models: {
    dashboard: modelsDashboard,
  },
  errors,
} = require('@funnelytics/shared-data');

const router = express.Router();

router.get('/:name', (req, res, next) => {
  return Promise.try(async () => {
    const acknowledgement = await modelsDashboard.UserAcknowledgement.forge().query(qb => {
      qb.where('user', req.user.id);
      qb.where('name', req.params.name);
      qb.where('has_acknowledged', true);
    }).fetch({
      columns: ['id'],
    });

    return Boolean(acknowledgement);
  }).then(hasAcknowledged => {
    return res.json({
      has_acknowledged: hasAcknowledged,
    });
  }).catch(err => {
    return next(err);
  });
});

router.get('/', (req, res, next) => {
  return Promise.try(async () => {
    return modelsDashboard.UserAcknowledgement.forge().query(qb => {
      qb.where('user', req.user.id);
      qb.whereIn('name', req.query.acknowledgements);
      qb.where('has_acknowledged', true);
    }).fetchAll({
      columns: ['name'],
    });
  }).then(results => {
    const verified = _.map(results.toJSON(), set => {
      return set.name;
    });
    return res.json(_.reduce(req.query.acknowledgements, (hash, acknowledgement) => {
      hash[acknowledgement] = verified.indexOf(acknowledgement) !== -1;
      return hash;
    }, {}));
  }).catch(err => {
    return next(err);
  });
});

router.post('/:name', (req, res, next) => {
  return Promise.try(async () => {
    const acknowledgement = {
      user: req.user.id,
      name: req.params.name,
      has_acknowledged: req.body.has_acknowledged,
      time_acknowledged: req.body.has_acknowledged ? new Date() : null,
    };

    return Promise.try(() => {
      return modelsDashboard.UserAcknowledgement.getSchema().validateAsync(acknowledgement, {
        stripUnknown: true,
      });
    }).catch(err => {
      throw errors.fromJoi(err);
    });
  }).then(validatedAcknowledgement => {
    const {
      user,
      name,
      has_acknowledged: hasAcknowledged,
      time_acknowledged: timeAcknowledged,
    } = validatedAcknowledgement;
    return BookshelfDashboard.transaction(async transacting => {
      const existingAcknowledgement = await modelsDashboard.UserAcknowledgement.forge().query(qb => {
        qb.where('user', user);
        qb.where('name', name);
      }).fetch({
        columns: ['id', 'has_acknowledged'],
        transacting,
      });

      if (existingAcknowledgement) {
        const isUpdateNotNeeded = existingAcknowledgement.get('has_acknowledged') === hasAcknowledged;
        if (isUpdateNotNeeded) {
          return existingAcknowledgement;
        }

        return existingAcknowledgement.save({
          has_acknowledged: hasAcknowledged,
          time_acknowledged: timeAcknowledged,
        }, {
          returning: ['id', 'has_acknowledged'],
          transacting,
          patch: true,
        });
      }

      return modelsDashboard.UserAcknowledgement.forge(validatedAcknowledgement).save({}, {
        returning: ['id', 'has_acknowledged'],
        transacting,
      });
    });
  }).then(currentAcknowledgement => {
    return res.json({
      has_acknowledged: currentAcknowledgement.get('has_acknowledged'),
    });
  }).catch(err => {
    return next(err);
  });
});

module.exports = router;

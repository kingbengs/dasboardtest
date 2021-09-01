'use strict';

const express = require('express');
const _ = require('lodash');

const {
  serializer: JSONAPI,
  models: {
    dashboard: modelsDashboard,
  },
} = require('@funnelytics/shared-data');

const Helpers = require('../lib/helpers/Helpers');

const router = express.Router();

// GET /, /find
router.get(['/', '/find'], (req, res, next) => {
  const externalIdArray = Helpers.convertCommaSplitToUniqueArray(_.get(req, ['query', 'invoices'], ''));

  return modelsDashboard.RecurlyInvoice.forge().query(qb => {
    qb.where('user', req.user.id);
    if (externalIdArray.length > 0) {
      qb.whereIn('external_id', externalIdArray);
    }
  }).fetchAll({
    withRelated: ['items'],
  }).then(invoices => {
    return JSONAPI.serializeAsync('recurly-invoice', invoices.toJSON());
  }).then(body => {
    return res.json(body);
  }).catch(err => {
    if (err.statusCode === 404) {
      return res.json({});
    }
    return next(err);
  });
});


module.exports = router;

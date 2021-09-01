'use strict';

const express = require('express');
const request = require('request-promise');
const {
  models: {
    dashboard: modelsDashboard,
  },
} = require('@funnelytics/shared-data');

const router = express.Router();

const wrapAsync = require('../utils/asyncWrap');

const createToken = async (req, res) => {
  const user = await modelsDashboard.User.forge().where({ id: req.user.id }).fetch();

  const expiryDate = new Date();
  expiryDate.setHours(expiryDate.getHours() + 12);

  const tokenResponse = await request({
    method: 'POST',
    url: 'https://api.hubapi.com/conversations/v3/visitor-identification/tokens/create',
    qs: {
      hapikey: process.env.HUBSPOT_API_KEY,
    },
    headers: {
      accept: 'application/json',
      'content-type': 'application/json'
    },
    body: {
      email: user.get('email'),
      firstName: user.get('first_name'),
      lastName: user.get('last_name'),
    },
    json: true
  });

  return res.status(201).json({
    token: tokenResponse.token,
    expiryDate,
  });
};

router.post('/token', wrapAsync(createToken));

module.exports = router;

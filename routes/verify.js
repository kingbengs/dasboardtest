'use strict';

const express = require('express');
const request = require('request-promise');
const Joi = require('@hapi/joi');
const _ = require('lodash');
const url = require('url');

const router = express.Router();
const {
  models: {
    dashboard: modelsDashboard,
  },
  errors,
  databases: {
    dashboard: BookshelfDashboard,
  },
  permissions: {
    PermissionManager,
    PermissionWrapper,
    PermissionScope,
    FetchPermissionOptions,
    AccessLevelInput,
  },
} = require('@funnelytics/shared-data');
const {
  constants: {
    Permissions,
  },
} = require('@funnelytics/utilities');

const wrapAsync = require('../utils/asyncWrap');

const getParseURL = raw => {
  const parsed = url.parse(raw);

  if (parsed.protocol) {
    return raw;
  }

  return `http://${raw}`;
};

const verifyScript = async (req, res) => {
  const body = await Joi.object().keys({
    project: Joi.string().uuid({
      version: ['uuidv4'],
    }).required(),
    domain: Joi.string().required(),
  }).validateAsync(req.body, {
    stripUnknown: true,
  });

  await BookshelfDashboard.transaction(async transacting => {
    const permissionManager = new PermissionManager(req.user.id);
    const permissionOptions = new FetchPermissionOptions({
      transacting,
      permission: new PermissionWrapper(Permissions.TYPE_ANALYTICS),
      scope: new PermissionScope({
        type: PermissionScope.TYPE_PROJECT,
        instance: body.project,
      }),
      accessLevel: new AccessLevelInput({ accessLevel: AccessLevelInput.ADMIN }),
    });

    const permissionResponse = await permissionManager.fetchPermissionResponse(permissionOptions);

    if (!permissionResponse.getHasPermission()) {
      throw errors.predefined.generic.forbidden;
    }
  });

  let response;
  let status;

  try {
    response = await request({
      method: 'POST',
      url: 'http://manual-browser-api-balancer-2048677378.us-west-2.elb.amazonaws.com/script-verification',
      json: true,
      body: _.merge(body, {
        domain: getParseURL(body.domain),
      }),
    });

    if (!response.error && response.matches === true) {
      status = 'verified';
      modelsDashboard.Project.forge().where({
        id: body.project,
      }).save({
        analytics_script_installed: true,
      }, {
        patch: true,
      });
    } else if (!response.error && response.matches === false) {
      status = 'incorrect-project';
    } else {
      status = 'browser-error';
    }
  } catch (err) {
    status = 'unknown-error';
  }

  return res.send({ status });
};

// POST /script
router.post('/script', wrapAsync(verifyScript));

module.exports = router;

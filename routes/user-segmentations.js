'use strict';

const express = require('express');
const {
  databases: {
    dashboard: BookshelfDashboard,
  },
  models: {
    dashboard: modelsDashboard,
  },
  serializer: JSONAPI,
  errors,
} = require('@funnelytics/shared-data');
const request = require('request-promise');
const Promise = require('bluebird');

const { Assertion } = require('@funnelytics/utilities');
const userSurveyKeys = require('../constants/user-segmentation-survey');

const { HUBSPOT_API_KEY } = process.env;

const router = express.Router();

router.get('/survey-status', async (req, res, next) => {
  const surveyDbKeys = Object.values(userSurveyKeys).map(value => { return value.dbKey; });

  try {
    const [hasCompletedSurvey] = (await BookshelfDashboard.knex.raw(
      'select exists(select 1 from user_segmentations where "user" = ? and key in (?, ?, ?, ?))',
      [
        req.user.id,
        ...surveyDbKeys,
      ],
    )).rows;
    res.json({ hasCompletedSurvey: hasCompletedSurvey.exists });
  } catch (e) {
    next(e);
  }
});

// POST /, /create
router.post(['/', '/create'], (req, res, next) => {
  return Promise.try(() => {
    const payload = JSONAPI.deserialize('user-segmentation', req.body);
    payload.user = req.user.id;

    return Promise.try(() => {
      return modelsDashboard.UserSegmentation.getSchema().validateAsync(payload, {
        stripUnknown: true,
      });
    }).catch(err => {
      throw errors.fromJoi(err);
    }).then(body => {
      return modelsDashboard.UserSegmentation.forge(body).save();
    }).then(result => {
      return JSONAPI.serializeAsync('user-segmentation', result.toJSON());
    }).then(body => {
      return res.status(201).json(body);
    });
  }).catch(err => {
    return next(err);
  });
});

// POST /register-results
router.post('/register-results', (req, res, next) => {
  Object.keys(req.body).forEach(key => {
    Assertion.validString(key, Object.keys(userSurveyKeys));
  });

  const segmentationDto = Object.entries(req.body).map(
    ([key, value]) => {
      return {
        user: req.user.id,
        key: userSurveyKeys[key].dbKey,
        value: value.title,
      };
    },
  );

  return BookshelfDashboard.transaction(transacting => {
    return Promise.all([
      modelsDashboard.User.forge().where({
        id: req.user.id,
      }).fetch({
        transacting,
        columns: ['email', 'phone'],
      }),
      Object.entries(req.body),
      modelsDashboard.UserSegmentation
        .collection(segmentationDto)
        .invokeThen('save', null, { method: 'insert' }),
    ]);
  }).then(result => {
    const [user, contactData] = result;

    return Promise.all([
      request({
        method: 'POST',
        url: 'https://api.hubapi.com/crm/v3/objects/contacts/search',
        qs: {
          hapikey: HUBSPOT_API_KEY,
        },
        json: true,
        body: {
          filterGroups: [
            {
              filters: [
                {
                  value: user.get('email'),
                  propertyName: 'email',
                  operator: 'EQ',
                },
              ],
            },
          ],
        },
      }),
      {
        ...contactData.reduce(
          (hubspotUpdateData, currentQuestion) => {
            const [key, answer] = currentQuestion;
            const keys = userSurveyKeys[key];

            if (key === 'role' && answer.hubspotValue === 'other') {
              hubspotUpdateData[keys.hubspotOtherKey] = answer.title;
              hubspotUpdateData[keys.hubspotKey] = 'other';
            } else {
              hubspotUpdateData[keys.hubspotKey] = answer.hubspotValue;
            }

            return hubspotUpdateData;
          },
          {},
        ),
      },
    ]);
  }).then(result => {
    const [hubspotContact, contactData] = result;
    const { results, total } = hubspotContact;

    if (!total) {
      throw new Error('Hubspot contact not found');
    }

    const [contact] = results;

    request({
      method: 'PATCH',
      url: `https://api.hubapi.com/crm/v3/objects/contacts/${contact.id}`,
      json: true,
      qs: {
        hapikey: HUBSPOT_API_KEY,
      },
      body: {
        properties: {
          ...contactData,
        },
      },
    }).then(updateHubspotResult => {
      res.json(updateHubspotResult);
    }).catch(error => {
      return next(error);
    });
  }).catch(err => {
    return next(err);
  });
});

module.exports = router;

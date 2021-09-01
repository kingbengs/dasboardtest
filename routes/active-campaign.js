const express = require('express');

const router = express.Router();
const ActiveCampaign = require('activecampaign');
const request = require('request-promise');

const accountId = '89485794';
const eventKey = '2652456f3f339a7e6f2585ab56c607573b832cbe';
const apiKey = 'a0372426ecdaaf2598741f3c88b1479559d395c6b6546c93c52a50635780ff52b41989d4';
const baseUrl = 'https://funnelytics14706.api-us1.com';
const ecomOrderUrl = `${baseUrl}/api/3/ecomOrders`;
const customerUrl = `${baseUrl}/api/3/ecomCustomers`;
const connectionUrl = `${baseUrl}/api/3/connections`;

router.post('/', (req, res, next) => {
  const ac = new ActiveCampaign(baseUrl, apiKey);
  ac.track_actid = accountId;
  ac.track_key = eventKey;

  const data = {
    event: req.body.event,
    eventKey,
    visit: req.body.visit,
    actid: accountId,
  };

  if (req.body.eventdata) {
    data.eventdata = req.body.eventdata;
  }

  return ac.api('tracking/log', data)
    .then(acResponse => {
      if (acResponse.success) {
        return res.status(200).json(acResponse);
      }
      return next(acResponse);
    })
    .catch(err => next(err));
});

router.post('/connection', (req, res, next) => request({
  uri: connectionUrl,
  method: 'GET',
  headers: {
    'Api-Token': apiKey,
  },
  json: true,
}).then(checkConnections => {
  if (checkConnections.meta.total > 0) {
    const hasExistingConnection = checkConnections.connections
      .find(_ => _.serviceName === 'FUNNELYTICS.IO');

    if (hasExistingConnection) {
      return res.send(hasExistingConnection);
    }
  }

  // create new connection
  return request({
    uri: connectionUrl,
    method: 'POST',
    encoding: null,
    body: {
      connection: {
        service: req.body.service,
        externalid: req.body.externalid,
        name: req.body.name,
        logoUrl: req.body.logoUrl,
        linkUrl: req.body.linkUrl,
      },
    },
    headers: {
      'Api-Token': apiKey,
    },
    json: true,
  }).then(connectionResponse => {
    if (connectionResponse && connectionResponse.connection) {
      return res.send(connectionResponse.connection);
    }

    return next(err);
  });
}).catch(err => next(err)));

router.post('/customer', (req, res, next) => request({
  uri: customerUrl,
  method: 'GET',
  headers: {
    'Api-Token': apiKey,
  },
  json: true,
}).then(checkCustomers => {
  if (checkCustomers.meta.total > 0) {
    const hasExistingCustomer = checkCustomers.ecomCustomers.find(_ => _.email === req.body.email);

    if (hasExistingCustomer) {
      return res.send(hasExistingCustomer);
    }
  }

  // create new customer
  request({
    uri: customerUrl,
    method: 'POST',
    encoding: null,
    body: {
      ecomCustomer: {
        connectionid: req.body.connectionid,
        externalid: req.body.externalid,
        email: req.body.email,
      },
    },
    headers: {
      'Api-Token': apiKey,
    },
    json: true,
  }).then(customerResponse => {
    if (customerResponse && customerResponse.ecomCustomer) {
      return res.send(customerResponse.ecomCustomer);
    }

    return next(err);
  }).catch(err => next(err));
}).catch(err => next(err)));

router.post('/order', (req, res, next) => request({
  uri: ecomOrderUrl,
  method: 'POST',
  encoding: null,
  body: {
    ecomOrder: req.body.ecomOrder,
  },
  headers: {
    'Api-Token': apiKey,
  },
  json: true,
}).then(orderResponse => {
  if (orderResponse && orderResponse.ecomOrder) {
    return res.send(orderResponse.ecomOrder);
  }

  return next(err);
}).catch(err => next(err)));

module.exports = router;

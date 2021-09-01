'use strict';

const {
  uuid: {
    ExternalProductIdentifier,
  },
} = require('@funnelytics/shared-data');

const ExternalServiceTypeConstants = require('../../constants/ExternalServiceTypeConstants');
const ExternalServiceTableConstants = require('../../constants/ExternalServiceTableConstants');
const ExternalServiceMapping = require('../attributes/ExternalServiceMapping');

const mappings = {
  [ExternalServiceTypeConstants.SUBSCRIPTIONS](ExternalServiceConfigClass) {
    return new ExternalServiceConfigClass({
      bookshelfServiceName: ExternalServiceTableConstants.MODEL_SUBSCRIPTIONS,
      bookshelfRelationshipName: ExternalServiceTableConstants.MODEL_USER_SUBSCRIPTIONS,
      externalServiceMappings: [
      ],
    });
  },
  [ExternalServiceTypeConstants.PRODUCTS](ExternalServiceConfigClass) {
    return new ExternalServiceConfigClass({
      bookshelfServiceName: ExternalServiceTableConstants.MODEL_PRODUCTS,
      bookshelfRelationshipName: ExternalServiceTableConstants.MODEL_USER_PRODUCTS,
      externalServiceMappings: [
        ExternalServiceMapping.createFromId(ExternalProductIdentifier.QUICK_WINS),
        ExternalServiceMapping.createFromId(ExternalProductIdentifier.IGNITE_TEMPLATES),
        ExternalServiceMapping.createFromId(ExternalProductIdentifier.FUNNELYTICS_MASTERY),
        ExternalServiceMapping.createFromId(ExternalProductIdentifier.SETUP_W_VIP_CALLS),
        ExternalServiceMapping.createFromId(ExternalProductIdentifier.MASTERY_AND_CERTIFICATION),
      ],
    });
  },
};

module.exports = mappings;

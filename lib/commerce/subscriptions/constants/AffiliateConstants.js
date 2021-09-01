'use strict';

const {
  ConstantsProxy,
} = require('@funnelytics/utilities');

const AffiliateConstants = ConstantsProxy.create({
  NOT_PROCESSED: 'not processed',
  PROCESSING_FAILED: 'processing failed',
  PROCESSED: 'processed',
});

module.exports = AffiliateConstants;

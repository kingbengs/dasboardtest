module.exports = {
  API_KEY: process.env.RECURLY_API_KEY,
  SUBDOMAIN: process.env.RECURLY_SUBDOMAIN || 'funnelytics',
  ENVIRONMENT: process.env.RECURLY_ENVIRONMENT,
  DEBUG: process.env.RECURLY_DEBUG === 'true',
  API_VERSION: 2.21,
};

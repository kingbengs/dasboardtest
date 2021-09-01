const config = {
  development: {
    token_secret: 'secret',
    bucket: 'funnelytics-staging',

  },
  production: {
    token_secret: process.env.TOKEN_SECRET,
    bucket: 'funnelytics-production',
  },
};

module.exports = config[process.env.NODE_ENV || 'development'];

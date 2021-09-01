const ConstantsProxy = requireRoot('/lib/meta/constants-proxy');

const LogLevels = ConstantsProxy({
  Error: 'error',
  Warn: 'warn',
  Info: 'info',
  Verbose: 'verbose',
  Debug: 'debug',
  Silly: 'silly',
});

module.exports = LogLevels;

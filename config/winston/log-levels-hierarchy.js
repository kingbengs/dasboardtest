const LogLevels = requireRoot('/config/winston/log-levels');

const logLevelHierarchy = [
  LogLevels.Error,
  LogLevels.Warn,
  LogLevels.Info,
  LogLevels.Verbose,
  LogLevels.Debug,
  LogLevels.Silly,
];

module.exports = logLevelHierarchy;

const _ = require('lodash');

const LogLevels = requireRoot('/config/winston/log-levels');
const logLevelHierarchy = requireRoot('/config/winston/log-levels-hierarchy');
const SILENT = requireRoot('/config/winston/is-silent');

class LogWrapper {
  constructor(logger) {
    this.logger = logger;
  }

  logLevelIsAtLeast(level) {
    const indexOfPassedLevel = logLevelHierarchy.indexOf(level);
    const indexOfConfigLevel = logLevelHierarchy.indexOf(process.env.WINSTON_LEVEL);

    if ([indexOfPassedLevel, indexOfConfigLevel].includes(-1)) {
      this.internalLog(LogLevels.Error, `${level} or ${process.env.WINSTON_LEVEL} is an invalid winston log level.`);
      return false;
    }

    if (SILENT) {
      return false;
    }

    return indexOfPassedLevel <= indexOfConfigLevel;
  }

  getLogger() {
    return this.logger;
  }

  profile(label) {
    this.getLogger().profile(label);
  }

  internalLog(level, message) {
    this.getLogger().log(level, message);
  }

  error(message) {
    this.log(LogLevels.Error, message);
  }

  _stringifyContent(content) {
    if (!_.isObject(content)) {
      return content;
    }

    let stringifiedRequest;
    try {
      stringifiedRequest = JSON.stringify(content);
    } catch (e) {
      stringifiedRequest = `Could not stringify content: ${content}`;
    }
    return stringifiedRequest;
  }

  _prependMessage(heading, string, message) {
    let finalMessage = string;
    if (message) {
      finalMessage = `
      ${heading}:
      ${this._stringifyContent(message)}

      ${string}
      `;
    }
    return finalMessage;
  }

  logWithOptions({
    request = false, error = new Error(), level = LogLevels.Error, message = '',
  }) {
    const stack = `STACK (might not be an actual error):
    ${_.get(error, 'stack', '')}`;

    let finalMessage = stack;
    if (request) {
      const nonCircularRequest = _.pick(request, [
        'method', 'originalUrl', 'body', 'query', 'params', 'cookies', 'hostname', 'baseUrl', 'path',
      ]);

      const requestAndStack = `${this._stringifyContent(nonCircularRequest)}`;

      finalMessage = this._prependMessage('REQUEST', finalMessage, requestAndStack);
    }

    finalMessage = this._prependMessage('ERROR', finalMessage, _.get(error, 'message'));

    finalMessage = this._prependMessage('MESSAGE', finalMessage, message);

    this.log(level, finalMessage);
  }

  info({ message = '', request = false }) {
    this.logWithOptions({
      message,
      request,
      level: LogLevels.Info,
    });
  }

  log(level, message) {
    if (this.logLevelIsAtLeast(level)) {
      if (_.isObject(message)) {
        this.internalLog(level, this._stringifyContent(message));
      } else {
        this.internalLog(level, message);
      }
    }
  }
}

module.exports = LogWrapper;

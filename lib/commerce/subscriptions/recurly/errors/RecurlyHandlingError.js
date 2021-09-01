module.exports = class RecurlyHandlingError extends Error {
  constructor(...args) {
    super(...args);
    this.name = 'RecurlyHandlingError';
  }
};

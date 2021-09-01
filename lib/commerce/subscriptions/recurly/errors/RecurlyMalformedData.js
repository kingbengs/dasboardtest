module.exports = class RecurlyMalformedData extends Error {
  constructor(status) {
    super();
    Error.captureStackTrace(this, this.constructor);
    this.name = 'RecurlyMalformedData';
    this.status = status;
    this.title = 'Data does not match expected format';
  }

  toJSON() {
    return {
      status: this.status,
      title: this.title,
    };
  }
};

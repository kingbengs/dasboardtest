module.exports = class RecurlyResponseError extends Error {
  constructor(status, response) {
    super();
    Error.captureStackTrace(this, this.constructor);
    this.name = 'RecurlyResponseError';
    this.status = status;
    this.title = 'Recurly returned an error';
    this.response = response;
  }

  toJSON() {
    return {
      status: this.status,
      title: this.title,
      response: this.response,
    };
  }
};

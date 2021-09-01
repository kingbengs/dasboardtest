module.exports = class RecurlyEntityCreationError extends Error {
  constructor(status) {
    super();
    Error.captureStackTrace(this, this.constructor);
    this.name = 'RecurlyEntityCreationError';
    this.status = status;
    this.title = 'Failed to create Recurly entity.';
  }

  toJSON() {
    return {
      status: this.status,
      title: this.title,
    };
  }
};

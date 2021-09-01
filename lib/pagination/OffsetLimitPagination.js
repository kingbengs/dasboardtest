const _ = require('lodash');

class OffsetLimitPagination {
  constructor(defaultLimit, defaultOffset = 0) {
    this._defaultOffset = defaultOffset;
    this._defaultLimit = defaultLimit;
  }

  getCurrentLimit(req) {
    const parsedLimit = parseInt(req.query.limit, 10);
    const isValid = _.isInteger(parsedLimit) && parsedLimit > 0;

    return isValid ? parsedLimit : this._defaultLimit;
  }

  getCurrentOffset(req) {
    const parsedOffset = parseInt(req.query.offset, 10);
    const isValid = _.isInteger(parsedOffset) && parsedOffset >= 0;

    return isValid ? parsedOffset : this._defaultOffset;
  }

  hasMore(req, total) {
    const limit = this.getCurrentLimit(req);
    const offset = this.getCurrentOffset(req);

    return total > offset + limit;
  }
}

module.exports = OffsetLimitPagination;

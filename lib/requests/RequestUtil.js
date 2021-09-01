const jwt = require('jsonwebtoken');
const {
  models
} = require('@funnelytics/shared-data');

module.exports = class RequestUtil {
  constructor(request) {
    this.request = request;
  }

  getIP() {
    let ip = this.request.ip;
    const header = this.request.headers['x-forwarded-for'];
    if (header) {
      ip = header.split(', ')[0];
    }
    return ip;
  }
};

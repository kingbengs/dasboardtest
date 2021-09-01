const _ = require('lodash');

module.exports = class CustomerWrapper {
  constructor(customer) {
    this.customer = customer;
  }

  getEmail() {
    const email = _.get(this.customer, 'email');

    // If empty string return undefined (just in case for consistency)
    if (_.isEmpty(email)) {
      return undefined;
    }

    return email;
  }

  getId() {
    const id = _.get(this.customer, 'id');

    // If empty string return undefined (just in case for consistency)
    if (_.isEmpty(id)) {
      return undefined;
    }

    return id;
  }
};

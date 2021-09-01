const {
  models: {
    dashboard: modelsDashboard,
  },
} = require('@funnelytics/shared-data');
const uuid = require('uuid/v4');

module.exports = class Revision {
  static getAvailableID(opts = {}) {
    const id = uuid();
    return modelsDashboard.Revision.forge().where({
      id,
    }).count({
      transacting: opts.transacting,
    }).then(count => {
      if (count === '0') {
        return id;
      }
      return Revision.getAvailableID(opts);
    });
  }
};

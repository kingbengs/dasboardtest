const {
  models: {
    dashboard: modelsDashboard,
  },
} = require('@funnelytics/shared-data');

const ProductUuids = requireRoot('/constants/products');

module.exports = class Vault {
  static add(email, opts = {}) {
    return modelsDashboard.User.forge().where({
      email,
    }).fetch({
      columns: ['id'],
      transacting: opts.transacting,
    }).then(user => {
      if (!user) {
        throw new Error(`No user with the email "${email}" found in the database.`);
      }

      return modelsDashboard.UserProduct.forge().save({
        user: user.get('id'),
        product: ProductUuids.Vault,
      }, {
        transacting: opts.transacting,
      });
    });
  }
};

const {
  models: {
    dashboard: modelsDashboard,
  },
} = require('@funnelytics/shared-data');

const Memberships = requireRoot('/constants/memberships');

module.exports = class Plus {
  static add(email, opts = {}) {
    return modelsDashboard.User.forge().where({
      email,
    }).save({
      membership: Memberships.Plus,
    }, {
      transacting: opts.transacting,
      patch: true,
      returning: ['id'],
    }).then(user => {
      return modelsDashboard.Product.forge().where({
      /**
       *! Warning, this is no longer valid, stripe_sku is not a column that exists on products
       */
        stripe_sku: process.env.ICONS_SKU,
      }).fetch({
        columns: ['id'],
        transacting: opts.transacting,
      }).then(product => {
        return modelsDashboard.UserProduct.forge().save({
          user: user.get('id'),
          product: product.get('id'),
        }, {
          transacting: opts.transacting,
        });
      });
    });
  }
};

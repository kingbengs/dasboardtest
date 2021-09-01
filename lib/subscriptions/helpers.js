const {
  models: {
    dashboard: modelsDashboard,
  },
} = require('@funnelytics/shared-data');

async function verifiedSubscriptionSKUs({ transacting, skus = [] }) {
  const allSkusCollection = await modelsDashboard.SubscriptionProduct.forge().fetchAll({
    columns: ['sku'],
    transacting,
  });
  const allSkus = allSkusCollection.map(sku => { return sku.get('sku'); });

  return skus.filter(sku => { return allSkus.includes(sku); });
}

module.exports = {
  verifiedSubscriptionSKUs,
};

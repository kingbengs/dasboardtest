const Analytics = require('analytics-node');
const { Events, Actions } = require('../../constants/analytics');

const segmentClient = new Analytics(process.env.SEGMENT_WRITE_KEY);

class Tracker {
  constructor(analyticsApiClient) {
    this._analyticsApiClient = analyticsApiClient;
  }

  trackOrderCompleted(userId, invoice) {
    this._analyticsApiClient.track({
      userId,
      event: Events.OrderCompleted,
      action: Actions.Track,
      properties: {
        orderId: invoice.getExternalId(),
        revenue: invoice.getChargeTotalInCents() / 100,
        currency: invoice.getCurrency(),
        products: invoice.getLineItems().map(i => {
          return {
            id: i.getExternalId(),
            name: i.getDescription(),
            sku: i.getSKU(),
            price: i.getTotalInCents() / 100,
            quantity: i.getQuantity(),
          };
        }),
      },
    });
  }
}

module.exports = new Tracker(segmentClient);

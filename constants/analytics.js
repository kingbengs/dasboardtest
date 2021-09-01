const ConstantsProxy = requireRoot('/lib/meta/constants-proxy');

module.exports = ConstantsProxy({
  Events: {
    OrderCompleted: 'Order Completed',
  },
  Actions: {
    Track: 'track',
  },
});

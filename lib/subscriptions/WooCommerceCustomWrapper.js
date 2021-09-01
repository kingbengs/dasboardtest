const request = require('request-promise');
const _ = require('lodash');
const qs = require('qs');

const WooCustomerWrapper = requireRoot('/lib/subscriptions/WooCustomerWrapper');
const WooOrderWrapper = requireRoot('/lib/subscriptions/WooOrderWrapper');
const WooProductWrapper = requireRoot('/lib/subscriptions/WooProductWrapper');
const WooSubscriptionWrapper = requireRoot('/lib/subscriptions/WooSubscriptionWrapper');

// TODO: Set domain in environment variables
const wcEndpoint = 'https://order.funnelytics.io/wp-json/wc';
const wcAuthString = `Basic ${Buffer.from(`${process.env.WOO_COMMERCE_WEBHOOK_KEY}:${process.env.WOO_COMMERCE_WEBHOOK_SECRET}`).toString('base64')}`;

function getCacheBustingCookieJar() {
  const cookieJar = request.jar();
  // woocommerce_items_in_cart cookie is required to bypass Kinsta cache
  // TODO: Set domain in environment variables
  cookieJar.setCookie('woocommerce_items_in_cart=1', 'https://order.funnelytics.io');

  return cookieJar;
}

async function wooCommerceRequest(requestOptions) {
  try {
    const options = _.assign({
      method: 'GET',
      jar: getCacheBustingCookieJar(),
      headers: {
        Authorization: wcAuthString,
      },
    }, requestOptions);

    const response = await request(options);

    return JSON.parse(response.trim());
  } catch (errorResponse) {
    try {
      // Return the error JSON
      return JSON.parse(errorResponse.error);
    } catch (secondError) {
      return {};
    }
  }
}

module.exports = class WooCommerceCustomWrapper {
  static async getSubscriptionById(id) {
    const subscriptionResponse = await wooCommerceRequest({
      url: `${wcEndpoint}/v1/subscriptions/${id}`,
    });

    return new WooSubscriptionWrapper(subscriptionResponse);
  }

  static getProductById(id) {
    return wooCommerceRequest({
      url: `${wcEndpoint}/v3/products/${id}`,
    });
  }

  static async getOrderById(id) {
    const orderResponse = await wooCommerceRequest({
      url: `${wcEndpoint}/v3/orders/${id}`,
    });

    return new WooOrderWrapper(orderResponse);
  }

  static async getProduct(id) {
    const productResponse = await wooCommerceRequest({
      url: `${wcEndpoint}/v3/products/${id}`,
    });

    return new WooProductWrapper(productResponse);
  }

  static getSubscriptions(parameters) {
    return wooCommerceRequest({
      url: `${wcEndpoint}/v1/subscriptions/?${qs.stringify(parameters)}`,
    });
  }

  static async getCustomer(id) {
    const userResponse = await wooCommerceRequest({
      url: `${wcEndpoint}/v3/customers/${id}`,
    });

    return new WooCustomerWrapper(userResponse);
  }

  static setOrderCompleteById(id) {
    return wooCommerceRequest({
      url: `${wcEndpoint}/v3/orders/${id}`,
      method: 'PUT',
      body: {
        status: 'completed',
      },
      json: true,
    });
  }
};

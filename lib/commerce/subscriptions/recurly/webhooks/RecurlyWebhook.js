const _ = require('lodash');
const xmljs = require('xml-js');

const RecurlyMalformedData = require('../errors/RecurlyMalformedData');
const Webhook = require('../../objects/Webhook');

/**
 * constructor - Provides utility functions for Recurly webhook data.
 */
module.exports = class RecurlyWebhook extends Webhook {
  getType() {
    if (this.type) {
      return this.type;
    }
    const keys = _.filter(_.keys(this.getParsedData()), item => {
      return item !== '_declaration';
    });
    if (keys.length !== 1) {
      throw new RecurlyMalformedData();
    }
    this.type = keys[0];
    return this.type;
  }

  getInvoiceId() {
    return _.get(this._toObject('invoice'), 'invoice_number');
  }

  getSubscriptionId() {
    return _.get(this._toObject('subscription'), ['uuid']);
  }

  getParsedData() {
    return this._parsedData;
  }

  setParsedData(rawData) {
    this._parsedData = xmljs.xml2js(rawData, {
      nativeType: true,
      compact: true,
      alwaysArray: true,
    });
  }

  static xmlReducer(xmlNode) {
    return _.reduce(xmlNode, (hash, item, key) => {
      const value = _.get(item, [0, '_text', 0]);
      // TODO: May want to handle arrays as well... currently these are ignored.
      if (value) {
        hash[key] = value;
      } else if (_.isPlainObject(_.get(item, 0)) && _.get(item, [0, '_attributes', 'nil']) !== 'true') {
        hash[key] = RecurlyWebhook.xmlReducer(_.get(item, 0));
      } else {
        hash[key] = null;
      }
      return hash;
    }, {});
  }

  _toObject(entity) {
    const type = this.getType();
    const raw = _.get(this.getParsedData(), [type, 0, entity, 0]);
    if (!raw) {
      throw new RecurlyMalformedData();
    }
    return RecurlyWebhook.xmlReducer(raw);
  }
};

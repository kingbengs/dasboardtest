'use strict';

const request = require('request-promise');
const Promise = require('bluebird');
const {
  databases: {
    dashboard: BookshelfDashboard,
  },
  models: {
    dashboard: modelsDashboard,
  },
} = require('@funnelytics/shared-data');
const _ = require('lodash');

const AffiliateConstants = require('../../subscriptions/constants/AffiliateConstants');
const SlackIntegration = require('../../../integrations/SlackIntegration');
const UnknownAffiliateError = require('./errors/UnknownAffiliateError');

module.exports = class TapFiliateOrder {
  constructor(orderId) {
    this.orderId = orderId;
    // this.affiliate_column = 'tapfiliate_click_id';
    this.information = null;
  }

  getOrderID() {
    return this.orderId;
  }

  getInformation() {
    if (this.information) {
      return Promise.resolve(this.information);
    }
    return request({
      method: 'GET',
      url: `https://api.tapfiliate.com/1.6/conversions/?external_id=${this.getOrderID()}`,
      headers: TapFiliateOrder.getHTTPHeaders(),
      json: true,
    }).then(res => {
      if (res.length === 0) {
        return null;
      }
      const information = res[0];
      this.information = information;
      return information;
    });
  }

  convert(amount, affiliate) {
    return this.getInformation().then(information => {
      if (information) {
        return this.addCommission(information.id, amount);
      }
      return request({
        method: 'POST',
        uri: 'https://api.tapfiliate.com/1.6/conversions/',
        headers: TapFiliateOrder.getHTTPHeaders(),
        body: {
          external_id: this.getOrderID(),
          amount,
          referral_code: affiliate,
        },
        json: true,
      }).then(res => {
        if (!res || res.length === 0) {
          return null;
        }
        return this;
      }).catch(err => {
        const hasOneError = _.get(err, ['error', 'errors', 'length']) === 1;
        if (!hasOneError) {
          throw err;
        }
        const UNKNOWN_REFERRER_ERROR = 'Unknown referral code';
        const firstError = _.get(err, ['error', 'errors', '0']);
        const isUnknownReferrer = _.get(firstError, ['message']) === UNKNOWN_REFERRER_ERROR;
        if (!isUnknownReferrer) {
          throw err;
        }
        throw new UnknownAffiliateError();
      });
    });
  }

  addCommission(conversion, amount) {
    return request({
      method: 'POST',
      uri: `https://api.tapfiliate.com/1.6/conversions/${conversion}/commissions/`,
      headers: TapFiliateOrder.getHTTPHeaders(),
      body: {
        conversion_sub_amount: amount,
      },
      json: true,
    }).then(() => {
      return this;
    });
  }

  /**
   * @param invoice Invoice object
   */
  static handleInvoice(invoice) {
    return BookshelfDashboard.transaction(transacting => {
      return Promise.props({
        user: modelsDashboard.User.forge().where({
          id: invoice.getUserId(),
        }).fetch({
          transacting,
          columns: ['tapfiliate_referrer'],
        }),
        invoiceRecord: modelsDashboard.RecurlyInvoice.forge().where({
          external_id: invoice.getExternalId(),
        }).fetch({
          transacting,
          columns: ['affiliate_status'],
        }),
      }).then(async ({ user, invoiceRecord }) => {
        if (invoiceRecord.get('affiliate_status') !== AffiliateConstants.NOT_PROCESSED) {
          return invoiceRecord.get('affiliate_status');
        }

        await Promise.map(invoice.getSubscriptionAdjustments(), async subscriptionAdjustment => {
          return modelsDashboard.RecurlyUserSubscription.forge().where({
            external_id: subscriptionAdjustment.getSubscriptionId(),
          }).fetch({
            columns: ['tapfiliate_click_id', 'external_id'],
            transacting,
          }).then(userSubscription => {
            if (!userSubscription) {
              return false;
            }
            const subscriptionAffiliate = userSubscription.get('tapfiliate_click_id');
            if (subscriptionAffiliate) {
              const total = subscriptionAdjustment.getTotalInCents() / 100;
              const id = userSubscription.get('external_id');
              const order = new TapFiliateOrder(id);
              return order.convert(total, subscriptionAffiliate).then(() => {
                return true;
              }).catch(err => {
                if (!(err instanceof UnknownAffiliateError)) {
                  throw err;
                }
                SlackIntegration.notifyForAffiliate({
                  invoiceId: invoice.getPrefixedExternalId(),
                  status: AffiliateConstants.PROCESSED,
                  additionalInformation: 'Subscription may need to be reviewed if we determine that this is a recognized affiliate we want to add into Tapfiliate.',
                  affiliate: subscriptionAffiliate,
                });
              });
            }
            return false;
          });
        });

        const affiliate = user.get('tapfiliate_referrer');
        if (!affiliate) {
          return AffiliateConstants.PROCESSED;
        }

        return Promise.all([
          Promise.try(() => {
            const order = new TapFiliateOrder(invoice.getPrefixedExternalId());
            const total = _.sumBy(invoice.getProductAdjustments(), productAdjustment => {
              return productAdjustment.getTotalInCents();
            }) / 100;
            if (total > 0) {
              return order.convert(total, affiliate).then(() => {
                return true;
              }).catch(err => {
                if (!(err instanceof UnknownAffiliateError)) {
                  throw err;
                }
                SlackIntegration.notifyForAffiliate({
                  invoiceId: invoice.getPrefixedExternalId(),
                  status: AffiliateConstants.PROCESSED,
                  additionalInformation: 'Invoice may need to be reviewed if we determine that this is a recognized affiliate we want to add into Tapfiliate.',
                  affiliate,
                });
              });
            }
            return false;
          }),
        ]).then(() => {
          return AffiliateConstants.PROCESSED;
        });
      }).then(affiliateStatus => {
        if (affiliateStatus !== AffiliateConstants.PROCESSED) {
          SlackIntegration.notifyForAffiliate({
            invoiceId: invoice.getPrefixedExternalId(),
            status: affiliateStatus,
            cause: 'Invoice must be handled manually due to previous error.',
          });
        }

        return modelsDashboard.RecurlyInvoice.forge().where({
          external_id: invoice.getExternalId(),
        }).save({
          affiliate_status: affiliateStatus,
        }, {
          transacting,
          patch: true,
        });
      }).catch(err => {
        SlackIntegration.notifyForAffiliate({
          invoiceId: invoice.getPrefixedExternalId(),
          status: AffiliateConstants.PROCESSING_FAILED,
          cause: `${err.name}, ${err.message}`,
        });

        return modelsDashboard.RecurlyInvoice.forge().where({
          external_id: invoice.getExternalId(),
        }).save({
          affiliate_status: AffiliateConstants.PROCESSING_FAILED,
        }, {
          transacting,
          patch: true,
        });
      });
    });
  }

  static getHTTPHeaders() {
    return {
      'Api-Key': process.env.TAPFILIATE_KEY,
    };
  }

  /*
  getClickID(transacting) {
    return BookshelfDashboard.knex.transacting(transacting).select(this.affiliate_column).from(qb1 => {
      qb1.select(this.affiliate_column);
      qb1.from('subscriptions');
      qb1.whereNotNull(this.affiliate_column).unionAll(qb2 => {
        qb2.select(this.affiliate_column);
        qb2.from('orders');
        qb2.whereNotNull(this.affiliate_column);
      });
      qb1.as('affiliates');
    }).then(rows => {
      if (rows.length <= 0) {
        return null;
      }
      return rows[0][this.affiliate_column];
    });
  }

  getAffiliate(transacting) {
    return this.getAffiliate(transacting).then(affiliate => {
      if (!affiliate) {
        return new Promise(resolve => {
          return resolve(null);
        });
      }
      return this.getInformation();
    }).then(info => {
      if (!info) {
        return null;
      }
      return new TapFiliateConversion(info.id);
    });
  }

  getConversion(transacting) {
    return this.getAffiliate(transacting).then(affiliate => {
      if (!affiliate) {
        return new Promise(resolve => {
          return resolve(null);
        });
      }
      return this.getInformation();
    }).then(info => {
      if (!info) {
        return null;
      }
      return info;
    });
  }
  */
};

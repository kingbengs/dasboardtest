const moment = require('moment');

const WOO_DATE_STORAGE_FORMAT = 'YYYY-MM-DDTHH:mm:ss';

module.exports = class WooDateContainer {
  constructor({
    wooDate, dbDate,
  }) {
    this.wooDateMoment = moment.utc(wooDate, WOO_DATE_STORAGE_FORMAT);
    this.dbDate = dbDate;
  }

  getWooDate() {
    return this.wooDateMoment;
  }

  mustUpdateDate() {
    return !this.getWooDate().isSame(this.dbDate, 'second');
  }

  getLatestDate() {
    return this.getWooDate().isValid() ? this.getWooDate() : null;
  }
};

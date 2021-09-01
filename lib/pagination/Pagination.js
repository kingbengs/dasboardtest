const _ = require('lodash');
const queryString = require('qs');
const url = require('url');

const URL = url.Url;

const PAGE_QUERY_KEY = 'page';
const RESERVED_PAGE_QUERY_KEY = 'page';
const NO_LINK_AVAILABLE = null;

class Pagination {
  constructor(firstPage, pageLength) {
    this._firstPage = firstPage;
    this._pageLength = pageLength;
  }

  generatePaginationUrl(req, page) {
    const requestUrl = new URL();
    requestUrl.host = req.get('host');
    requestUrl.pathname = req.baseUrl;
    requestUrl.protocol = req.protocol;

    const queryCopy = _.cloneDeep(req.query);
    // The page has to be separate from the page in the query, we want to set the page explicitly to generate the link.
    queryCopy[RESERVED_PAGE_QUERY_KEY] = page;

    // Attach query paramters to the URL as a string.
    requestUrl.search = queryString.stringify(queryCopy, { arrayFormat: 'bracket' });

    return url.format(requestUrl);
  }

  pageProvided(req) {
    return _.has(req.query, PAGE_QUERY_KEY);
  }

  getCurrentPage(req) {
    const parsedPage = parseInt(req.query.page, 10);
    const pageValid = _.isInteger(parsedPage) && parsedPage >= 1;

    return pageValid ? parsedPage : this._firstPage;
  }

  getJSONAPILinks(req, total) {
    if (!this.pageProvided(req)) {
      return null;
    }

    const lastPageNumber = Math.ceil(total / this._pageLength);
    const currentPage = this.getCurrentPage(req);

    const onFirstPage = currentPage === this._firstPage;
    const onLastPage = currentPage >= lastPageNumber;

    const firstPage = onFirstPage ? NO_LINK_AVAILABLE : this._firstPage;
    const lastPage = onLastPage ? NO_LINK_AVAILABLE : lastPageNumber;
    const nextPage = onLastPage ? NO_LINK_AVAILABLE : currentPage + 1;
    const previousPage = onFirstPage ? NO_LINK_AVAILABLE : currentPage - 1;

    const pageLinkNumbers = {
      first: firstPage,
      self: currentPage,
      last: lastPage,
      next: nextPage,
      prev: previousPage,
    };

    return _.reduce(pageLinkNumbers, (linkHash, page, key) => {
      if (page !== NO_LINK_AVAILABLE) {
        linkHash[key] = this.generatePaginationUrl(req, page);
      }
      return linkHash;
    }, {});
  }
}

module.exports = Pagination;

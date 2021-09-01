const ConstantsProxy = requireRoot('/lib/meta/constants-proxy');

/**
 * These are the statuses for our database table that tracks what is happening with
 * woo commerce orders on our end. Separate from the statuses that we expect to read
 * from the woo commerce order objects pulled from their rest API.
 */

module.exports = ConstantsProxy({
  Completed: 'completed',
  Processing: 'processing',
  Failed: 'failed',
});

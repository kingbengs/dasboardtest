const cluster = require('cluster');

const getInstanceId = requireRoot('/config/aws/get-instance-id');

const instanceId = getInstanceId();

function workerId() {
  if (cluster.isMaster) {
    return `master-${process.pid}`;
  } if (cluster.isWorker) {
    return `worker-${cluster.worker.id}`;
  }
  return 'unknown-cluster';
}

function streamSuffix() {
  try {
    const suffix = `${instanceId}/${workerId()}`;

    return suffix;
  } catch (err) {
    console.log(err);
    return 'stream-suffix-errors';
  }
}

function groupPrefix() {
  return 'dashboard-api';
}

function groupSuffix() {
  return process.env.NODE_ENV;
}

module.exports = {
  streamSuffix,
  groupPrefix,
  groupSuffix,
};

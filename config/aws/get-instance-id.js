const request = require('sync-request');

const options = {
  timeout: 5000,
};

function getInstanceId() {
  if (process.env.NOT_ON_EC2 === 'true') {
    return 'no-instance-id-available';
  }

  try {
    const res = request('GET', 'http://169.254.169.254/latest/meta-data/instance-id', options);
    return res.getBody();
  } catch (err) {
    return 'no-instance-id-found';
  }
}

module.exports = getInstanceId;

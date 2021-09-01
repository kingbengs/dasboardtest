const { createLogger } = require('winston');
const WinstonCloudWatch = require('winston-cloudwatch');

const LogWrapper = requireRoot('/config/winston/wrapper');
const SILENT = requireRoot('/config/winston/is-silent');
const { groupPrefix, streamSuffix, groupSuffix } = requireRoot('/config/winston/helpers');

function loggerGenerator(streamName) {
  const noSubscriptionsLoggerInternal = createLogger({
    level: process.env.WINSTON_LEVEL || 'error',
    transports: [],
    SILENT,
  });

  noSubscriptionsLoggerInternal.add(new WinstonCloudWatch({
    logGroupName: `${groupPrefix()}/${groupSuffix()}`,
    logStreamName: `${streamName}/${streamSuffix()}`,
    awsRegion: process.env.AWS_REGION,
    awsAccessKeyId: process.env.FUNNELYTICS_AWS_LOG_KEY,
    awsSecretKey: process.env.FUNNELYTICS_AWS_LOG_SECRET,
  }));

  return new LogWrapper(noSubscriptionsLoggerInternal);
}

module.exports = loggerGenerator;

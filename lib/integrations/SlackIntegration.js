'use strict';

const {
  Assertion,
} = require('@funnelytics/utilities');

const slack = require('slack-notify')(process.env.SLACK_WEBHOOK_URL);

const NOTIFICATIONS_CHANNEL = '#dev-notifications';

class SlackIntegration {
  static reportMissingUser({
    type,
    elementLabel,
    userId,
  }) {
    Assertion.string(type);
    Assertion.string(elementLabel);
    Assertion.string(userId);

    SlackIntegration.notifyForWebhook({
      type,
      message: `No user with ID \`${userId}\` found when servicing \`${elementLabel}\``,
    });
  }

  static reportMissingSubscriptionSKU({
    type,
    elementLabel,
    SKU,
  }) {
    Assertion.string(type);
    Assertion.string(elementLabel);
    Assertion.string(SKU);

    SlackIntegration.notifyForWebhook({
      type,
      message: `No subscription SKU \`${SKU}\` found when servicing \`${elementLabel}]\``,
    });
  }

  static reportMissingAddOnSKU({
    requiredSKUs,
    type,
    elementLabel,
  }) {
    Assertion.string(type);
    Assertion.string(elementLabel);
    Assertion.arrayOfStrings(requiredSKUs);
    
    SlackIntegration.notifyForWebhook({
      type,
      message: `Not all Add On SKUs \`${requiredSKUs.join(', ')}\` were found when servicing \`${elementLabel}]\``,
    });
  }

  static reportMissingLineItemSKU({
    type,
    externalId,
    invoiceId,
    productCode,
    description,
    lineItemType,
  }) {
    Assertion.string(type);
    Assertion.string(externalId);
    Assertion.string(invoiceId);
    Assertion.string(productCode, {
      allowNull: true,
    });
    Assertion.string(description);
    Assertion.string(lineItemType);

    if (productCode !== null) {
      SlackIntegration.notifyForWebhook({
        type,
        message: `SKU \`${productCode}\` not found when servicing adjustment with Recurly ID "${externalId}" on Invoice with db ID \`${invoiceId}\` and description *"${description}"* of type \`${lineItemType}\``,
        icon: ':warning:',
      });
    }
  }

  static notifyForExternalService({
    serviceId,
    userId,
    recordId,
    activating,
    cause,
    icon = ':linked_paperclips:',
  }) {
    Assertion.uuid(serviceId);
    Assertion.uuid(userId);
    Assertion.uuid(recordId);
    Assertion.string(icon);
    Assertion.string(cause);
    Assertion.boolean(activating);

    const text = `${icon} User \`${userId}\`'s external service identified \`${serviceId}\` was *NOT* properly *${activating ? 'activated' : 'terminated'}*.

This service-user record is identified in our database as \`${recordId}\`.

*Cause:* ${cause}`;

    console.log(`Logging to Slack: ${text}`);

    slack.send({
      channel: NOTIFICATIONS_CHANNEL,
      text,
    });
  }

  static notifyForAffiliate({
    invoiceId,
    status,
    additionalInformation,
    icon = ':chart_with_downwards_trend:',
    affiliate = 'unknown',
  }) {
    Assertion.string(invoiceId);
    Assertion.string(status);
    Assertion.string(additionalInformation);
    Assertion.string(icon);

    const text = `${icon} Invoice identified as \`${invoiceId}\` has the status \`${status}\`. With unrecognized affiliate: ${affiliate}

    *Additional Information:* ${additionalInformation}`;

    console.log(`Logging to Slack: ${text}`);

    slack.send({
      channel: NOTIFICATIONS_CHANNEL,
      text,
    });
  }

  static notifyForWebhook({
    type,
    message,
    icon = ':bangbang:',
  }) {
    Assertion.string(type);
    Assertion.string(message);
    Assertion.string(icon);

    const text = `${icon} Webhook of type \`${type}\` reporting the following message:

${message}`;

    console.log(`Logging to Slack: ${text}`);

    slack.send({
      channel: NOTIFICATIONS_CHANNEL,
      text,
    });
  }

  static notifyForEvents({
    message,
    icon = ':bust_in_silhouette:',
  }) {
    Assertion.string(message);
    Assertion.string(icon);

    const text = `${icon} Event integration failed with the following message:

${message}`;

    console.log(`Logging to Slack: ${text}`);

    slack.send({
      channel: NOTIFICATIONS_CHANNEL,
      text,
    });
  }

  static notifyHasConflictingPermissions({
    customerIdentification,
    icon = ':fry:',
  }) {
    const text = `${icon} May want to determine what to do with the following customer who has conflicting permissions:
    
    ${customerIdentification}`;

    SlackIntegration.sendMessage(text);
  }

  static notifyNoConflictingPermissions({
    customerIdentification,
    icon = ':cat_ball:',
  }) {
    const text = `${icon} May want to determine what to do with the following customer who no longer has conflicting permissions:
    
    ${customerIdentification}`;

    SlackIntegration.sendMessage(text);
  }


  static sendMessage(text) {
    Assertion.string(text);

    console.log(`Logging to Slack: ${text}`);
    
    slack.send({
      channel: NOTIFICATIONS_CHANNEL,
      text,
    });
  }
}

module.exports = SlackIntegration;

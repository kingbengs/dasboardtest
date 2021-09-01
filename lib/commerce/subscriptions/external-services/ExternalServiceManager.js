'use strict';

const Promise = require('bluebird');
const _ = require('lodash');
const {
  databases: {
    dashboard: BookshelfDashboard,
  },
  models: {
    dashboard: modelsDashboard,
  },
} = require('@funnelytics/shared-data');
const {
  Assertion,
} = require('@funnelytics/utilities');

const ExternalServiceConfig = require('./config/ExternalServiceConfig');
const ExternalServiceStatusConstants = require('./constants/ExternalServiceStatusConstants');
const SyncStatusOptions = require('./options/SyncStatusOptions');
const ExternalServiceToUpdate = require('../options/post-webhook/update-external-services/ExternalServiceToUpdate');
const SlackIntegration = require('../../../integrations/SlackIntegration');

class ExternalServiceManager {
  constructor(externalServiceConfig) {
    this.setExternalServiceConfig(externalServiceConfig);
  }

  updateExternalService(options) {
    return Promise.try(() => {
      Assertion.instanceOf(options, ExternalServiceToUpdate);

      return BookshelfDashboard.knex.transaction(async transacting => {
        const serviceModelName = this.getBookshelfServiceName();
        const serviceRecord = await modelsDashboard[serviceModelName].forge().where({
          id: options.getServiceId(),
        }).fetch({
          columns: [
            this.getIdColumn(),
            this.getExternalActionRequiredColumn(),
          ],
          transacting,
        });

        if (!serviceRecord.get(this.getExternalActionRequiredColumn())) {
          return false;
        }

        const userServiceModelName = this.getBookshelfRelationshipName();
        const alreadyUpdatedUserServiceRecord = await modelsDashboard[userServiceModelName].forge().where({
          id: options.getRecordId(),
          [this.getExternalStatusColumn()]: options.isActivating()
            ? ExternalServiceStatusConstants.ACTIVATED
            : ExternalServiceStatusConstants.TERMINATED,
        }).fetch({
          transacting,
          columns: ['id'],
        });

        if (alreadyUpdatedUserServiceRecord) {
          return true;
        }

        const serviceId = serviceRecord.get(this.getIdColumn());
        const syncMethod = options.isActivating()
          ? this.getExternalServiceConfig().getActivateMethodById(serviceId)
          : this.getExternalServiceConfig().getTerminateMethodById(serviceId);

        if (!_.isFunction(syncMethod)) {
          SlackIntegration.notifyForExternalService({
            serviceId,
            userId: options.getUserId(),
            recordId: options.getRecordId(),
            activating: options.isActivating(),
            cause: 'Missing integration (no sync method)',
          });
          return false;
        }

        const syncStatusOptions = new SyncStatusOptions({
          recordId: options.getRecordId(),
          transacting,
          status: options.isActivating()
            ? ExternalServiceStatusConstants.ACTIVATED
            : ExternalServiceStatusConstants.TERMINATED,
        });

        return syncMethod(options.getUserId()).then(async () => {
          await this.syncRecordStatus(syncStatusOptions);

          return true;
        }).catch(async err => {
          const failedStatus = options.isActivating()
            ? ExternalServiceStatusConstants.ACTIVATION_FAILED
            : ExternalServiceStatusConstants.TERMINATION_FAILED;
          syncStatusOptions.setStatus(failedStatus);

          await this.syncRecordStatus(syncStatusOptions);

          SlackIntegration.notifyForExternalService({
            serviceId,
            userId: options.getUserId(),
            recordId: options.getRecordId(),
            activating: options.isActivating(),
            cause: err.message,
          });

          return false;
        });
      });
    });
  }

  syncRecordStatus(syncStatusOptions) {
    return Promise.try(() => {
      Assertion.instanceOf(syncStatusOptions, SyncStatusOptions);

      const model = this.getBookshelfRelationshipName();
      const recordId = syncStatusOptions.getRecordId();
      const transacting = syncStatusOptions.getTransacting();

      return modelsDashboard[model].forge().where({
        id: recordId,
      }).save({
        [this.getExternalStatusColumn()]: syncStatusOptions.getStatus(),
      }, {
        transacting,
        patch: true,
      });
    });
  }

  getExternalServiceConfig() {
    return this._externalServiceConfig;
  }

  getBookshelfServiceName() {
    return this.getExternalServiceConfig().getBookshelfServiceName();
  }

  getBookshelfRelationshipName() {
    return this.getExternalServiceConfig().getBookshelfRelationshipName();
  }

  getIdColumn() {
    return this.getExternalServiceConfig().getIdColumn();
  }

  getExternalActionRequiredColumn() {
    return this.getExternalServiceConfig().getExternalActionRequiredColumn();
  }

  getExternalStatusColumn() {
    return this.getExternalServiceConfig().getExternalStatusColumn();
  }

  setExternalServiceConfig(externalServiceConfig) {
    Assertion.instanceOf(externalServiceConfig, ExternalServiceConfig);

    this._externalServiceConfig = externalServiceConfig;
  }
}

module.exports = ExternalServiceManager;

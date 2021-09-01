const express = require('express');
const Promise = require('bluebird');
const _ = require('lodash');
const {
  models: {
    dashboard: modelsDashboard,
  },
  databases: {
    dashboard: BookshelfDashboard,
  },
  serializer: JSONAPI,
  errors: { AppError },
  permissions: {
    PermissionManager,
    PermissionWrapper,
    PermissionScope,
    FetchPermissionOptions,
    AccessLevelInput,
  },
} = require('@funnelytics/shared-data');
const {
  constants: {
    Permissions,
  },
} = require('@funnelytics/utilities');

const router = express.Router();

// GET /, /find
router.get(['/', '/find'], (req, res, next) => {
  return modelsDashboard.Vault.forge().query(qb => {
    _.each(req.query.filter || {}, (val, key) => {
      if (val) {
        qb.where(key, val);
      }
    });
  }).fetchAll({
    withRelated: req.query.include || [],
  }).then(vaults => {
    return JSONAPI.serializeAsync('vault', vaults.toJSON());
  }).then(body => {
    return res.json(body);
  }).catch(err => {
    return next(err);
  });
});

// GET /:id, /find/:id
router.get(['/:id', '/find/:id'], (req, res, next) => {
  return BookshelfDashboard.transaction(async transacting => {
    const manager = new PermissionManager(req.user.id);

    return Promise.props({
      permissionResponse: manager.fetchPermissionResponse(new FetchPermissionOptions({
        transacting,
        permission: new PermissionWrapper(Permissions.TYPE_VAULT),
        scope: new PermissionScope({
          type: 'user',
          instance: req.user.id,
        }),
        accessLevel: new AccessLevelInput({
          accessLevel: AccessLevelInput.READ,
        }),
      })),
      fullVault: modelsDashboard.Vault.forge().where(_.extend(req.query.filter || {}, {
        id: req.params.id,
      })).fetch({
        transacting,
        columns: ['id', 'image', 'title', 'description', 'offer_types_id', 'industries_id', 'premium'],
        withRelated: ['industry', 'offer', {
          media(qb) {
            qb.column('id', 'media_type', 'link', 'vault_id');
          },
        }, {
          links(qb) {
            qb.column('id', 'title', 'link', 'vault_id');
          },
        }],
      }),
    }).then(({ permissionResponse, fullVault }) => {
      if (fullVault.get('premium') && !permissionResponse.getHasPermission()) {
        throw new AppError(
          403,
          'User Does Not Have Product',
          'You must have the vault to view this.',
        );
      }
      return fullVault;
    });
  }).then(vault => {
    return JSONAPI.serializeAsync('vault', vault.toJSON());
  }).then(body => {
    return res.json(body);
  }).catch(err => {
    return next(err);
  });
});

module.exports = router;

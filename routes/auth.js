const express = require('express');

const router = express.Router();
const Promise = require('bluebird');
const bcrypt = require('bcryptjs');
const {
  errors,
  models: {
    dashboard: modelsDashboard,
  },
  databases: {
    dashboard: BookshelfDashboard,
  },
  permissions: {
    PermissionManager,
    PermissionWrapper,
    PermissionScope,
    FetchPermissionOptions,
    AccessLevelInput,
  },
} = require('@funnelytics/shared-data');
const jwt = require('jsonwebtoken');
const RequestUtil = require('../lib/requests/RequestUtil');

const compare = Promise.promisify(bcrypt.compare);

router.post('/', (req, res, next) => {
  return BookshelfDashboard.transaction(t => {
    const util = new RequestUtil(req);
    const ip = util.getIP();
    const email = req.body.username.toLowerCase();
    return Promise.props({
      // This is an admin who is logging into a user's account
      admin: new Promise((resolve, reject) => {
        const token = req.get('authorization');
        if (!token) {
          return resolve(null);
        }
        const payload = token.split(' ')[1];
        return jwt.verify(payload, process.env.TOKEN_SECRET, (err, decoded) => {
          if (err) {
            return reject(err);
          }
          return modelsDashboard.User.forge().query(qb => {
            qb.where('id', decoded.id);
            qb.where('role', '>', 4);
          }).fetch({
            columns: ['id', 'role'],
            transacting: t,
          }).then(user => {
            return resolve(user);
          }).catch(err => {
            return reject(err);
          });
        });
      }),
      user: modelsDashboard.User.forge({
        email,
      }).fetch({
        transacting: t,
        columns: ['id', 'password', 'role'],
      }).then(user => {
        if (!user) {
          throw errors.predefined.users.mismatch;
        }
        return user;
      }),
      hasWhitelistedIP: modelsDashboard.WhitelistedLoginIP.forge().query(qb => {
        qb.leftJoin(
          'users',
          'whitelisted_login_ips.user',
          'users.id',
        );
        qb.where('users.email', email);
      }).fetch({
        transacting: t,
        columns: ['ip'],
      }).then(whitelisted => {
        if (!whitelisted) {
          return true;
        }
        return whitelisted.get('ip') === ip;
      }),
    });
  }).then(result => {
    return Promise.props({
      admin: result.admin,
      user: result.user,
      hasCorrectCredentials: (function () {
        if (result.admin) {
          const isSameUser = result.user.get('id') === result.admin.get('id');
          if (result.user.get('role') > 4 && !isSameUser) {
            return false;
          }
          return true;
        }
        return compare(req.body.password, result.user.get('password') || '');
      }()),
      hasWhitelistedIP: result.hasWhitelistedIP,
      hasVipPermission: (function() {
        if (process.env.IS_VIP !== 'true') {
          return false;
        }

        return BookshelfDashboard.transaction(async transacting => {
          const permissionManager = new PermissionManager(result.user.get('id'));
          const permissionOptions = new FetchPermissionOptions({
            transacting,
            permission: new PermissionWrapper('feature.vip'),
            scope: new PermissionScope({
              type: PermissionScope.TYPE_USER,
              instance: result.user.get('id'),
            }),
            accessLevel: new AccessLevelInput({
              accessLevel: AccessLevelInput.WRITE,
            }),
          });

          const hasVip = (await permissionManager.fetchPermissionResponse(permissionOptions)).getHasPermission();

          if (hasVip === true) {
            return true;
          }

          const sharedProjectOwners = (await transacting.raw(
            `
              SELECT
                  DISTINCT p."user"
              FROM project_clients pc
              JOIN projects p on pc.project = p.id
              WHERE pc."user" = ?
              AND pc.user IS NOT NULL;
            `,
            [
              result.user.get('id'),
            ],
          )).rows.map(row => {
            return row.user;
          });

          const ownersHaveVipPermission = await Promise.all(sharedProjectOwners.map(owner => {
            return new PermissionManager(owner).fetchPermissionResponse(new FetchPermissionOptions({
              transacting,
              permission: new PermissionWrapper('feature.vip'),
              scope: new PermissionScope({
                type: PermissionScope.TYPE_USER,
                instance: owner,
              }),
              accessLevel: new AccessLevelInput({
                accessLevel: AccessLevelInput.WRITE,
              }),
            }));
          }));

          return ownersHaveVipPermission.map(response => {
            if (response.getHasPermission()) {
              return response.getHasPermission();
            }

            return false;
          }).indexOf(true) !== -1;
        });
      })(),
    });
  }).then(result => {
    if (process.env.IS_VIP === 'true' && !result.hasVipPermission) {
      throw errors.predefined.generic.forbidden;
    }

    if (result.hasCorrectCredentials && result.hasWhitelistedIP) {
      const toReturn = {
        access_token: jwt.sign({
          id: result.user.get('id'),
        }, process.env.TOKEN_SECRET),
        id: result.user.get('id'),
        has_vip_permission: result.hasVipPermission,
      };

      if (result.admin && result.user.get('id') !== result.admin.get('id')) {
        toReturn.isAdminLoginAsUser = true;
      }

      return res.json(toReturn);
    }
    if (result.hasCorrectCredentials && !result.hasWhitelistedIP) {
      throw new errors.AppError(
        401,
        'Stop right there, bud.',
        'Something doesn\'t seem quite right about this.',
      );
    }
    throw errors.predefined.users.mismatch;
  }).catch(err => {
    return next(err);
  });
});

module.exports = router;

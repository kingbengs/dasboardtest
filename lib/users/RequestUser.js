const jwt = require('jsonwebtoken');
const _ = require('lodash');
const Bluebird = require('bluebird');
const {
  databases: {
    dashboard: BookshelfDashboard,
  },
  models: {
    dashboard: modelsDashboard,
  },
  permissions: {
    PermissionManager,
    PermissionWrapper,
    PermissionScope,
    FetchPermissionOptions,
    FetchPermissionAllowanceOptions,
    AccessLevelInput,
  },
} = require('@funnelytics/shared-data');
const {
  constants: {
    Permissions,
  },
} = require('@funnelytics/utilities');
const User = requireRoot('/constants/user');

module.exports = class RequestUser {
  constructor(id) {
    this._id = id;
    this._permissionManager = null;
  }

  getID() {
    return this._id;
  }

  getPermissionManager() {
    if (!this._permissionManager) {
      this._permissionManager = new PermissionManager(this.getID());
    }
    return this._permissionManager;
  }

  static getDecodedToken(token) {
    return new Promise((resolve, reject) => {
      jwt.verify(token, process.env.TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return reject(err);
        }
        return resolve(decoded);
      });
    });
  }

  static getRecommendedProPlan(projects) {
    return _.get(_.find([
      {
        projects: 2,
        url: 'pro',
      },
      {
        projects: 10,
        url: 'pro',
      },
      {
        projects: 20,
        url: 'pro',
      },
    ], plan => {
      return plan.projects > projects;
    }), 'url', null);
  }

  hasPermission(permission, {
    admin = false,
    write = true,
    scope = null,
    transacting = null,
  } = {}) {
    if (!scope) {
      scope = new PermissionScope({
        type: PermissionScope.TYPE_USER,
        instance: this.getID(),
      });
    }
    let accessLevel = AccessLevelInput.READ;
    if (write) {
      accessLevel = AccessLevelInput.WRITE;
    }
    if (admin) {
      accessLevel = AccessLevelInput.ADMIN;
    }

    return this.getPermissionManager().fetchPermissionResponse(new FetchPermissionOptions({
      transacting,
      permission: new PermissionWrapper(permission),
      scope,
      accessLevel: new AccessLevelInput({
        accessLevel,
      }),
    })).then(response => {
      return response.getHasPermission();
    });
  }

  getWorkspaceCount({
    transacting = null,
    isLocked = false,
  } = {}) {
    let isLockedWhere;
    switch (isLocked) {
      case true:
        isLockedWhere = true;
        break;
      case false:
        isLockedWhere = false;
        break;
      default:
        break;
    }
    /**
     * Accounts for soft deletion here as well:
     */
    return modelsDashboard.Project.forge().where({
      user: this.getID(),
      is_locked: isLockedWhere,
    }).count({
      transacting,
    }).then(countString => {
      const projectCount = parseInt(countString, 10);

      return projectCount;
    });
  }

  getFunnelCount({
    transacting = null,
    isLocked = false,
  } = {}) {
    let constraint = '';
    switch (isLocked) {
      case true:
        constraint = 'AND funnels.is_locked = TRUE';
        break;
      case false:
        constraint = 'AND funnels.is_locked = FALSE';
        break;
      default:
        break;
    }
    return BookshelfDashboard.knex.raw(
      `
      SELECT COUNT(DISTINCT sub.id) FROM (
        (
          SELECT funnels.id
          FROM funnels
          WHERE funnels.user = ?
          AND funnels.project IS NULL
          ${constraint}
        )
        UNION ALL
        (
          SELECT funnels.id
          FROM funnels
          JOIN projects ON funnels.project = projects.id
          WHERE funnels.project IS NOT NULL
          AND projects.user = ?
          AND projects.deleted_at IS NULL
          ${constraint}
        )
      ) AS sub;
      `,
      [
        this.getID(),
        this.getID(),
      ],
    ).transacting(transacting).then(response => {
      const funnelCount = parseInt(response.rows[0].count, 10);

      return funnelCount;
    });
  }

  getSessionsCount({
    transacting = null,
  } = {}) {
    const RESULT_COLUMN = 'total-sessions-count';
    return Bluebird.try(async () => {
      const projects = await modelsDashboard.Project.forge().where('user', this.getID()).fetchAll({
        columns: ['int_id'],
        transacting,
      });

      const MIN_NUMBER = 1;
      const MAX_NUMBER = 2147483647;
      const projectIntIds = projects.map(project => {
        const intId = project.get('int_id');
        // Protect against SQL injection (from ourselves...) here:
        if (!_.isInteger(intId) || intId < MIN_NUMBER || intId > MAX_NUMBER) {
          throw new Error(`Invalid int_id for lifetime sessions check: ${intId}`);
        }

        return intId;
      });

      if (projectIntIds.length === 0) {
        return 0;
      }

      /**
       * This does not take into account whether a project is soft deleted or not. We get all the sessions regardless
       * which allows us to count lifetime sessions even from projects that have been deleted.
       */
      const rawSQL = `
        SELECT SUM(sub.total) AS "${RESULT_COLUMN}" FROM (
          SELECT
            users.id AS "user",
            remote.total
          FROM dblink('redshift_server',
            $REDSHIFT$
              SELECT tracker_sessions.project, APPROXIMATE COUNT(DISTINCT tracker_sessions.id) AS total FROM tracker_sessions
              WHERE tracker_sessions.project IN (
                ${projectIntIds.join(', ')}
              )
              GROUP BY tracker_sessions.project
              ORDER BY total DESC;
            $REDSHIFT$
          )
          AS remote(project INTEGER, total INTEGER)
          LEFT JOIN projects ON remote.project = projects.int_id
          LEFT JOIN users ON users.id = projects.user
          WHERE users.id = :userId
        )
        AS sub;
      `;
      const result = await BookshelfDashboard.knex.raw(rawSQL, {
        userId: this.getID(),
      }).transacting(transacting);

      const DEFAULT_COUNT = 0;
      return parseInt(_.get(result, ['rows', 0, RESULT_COLUMN], DEFAULT_COUNT), 10);
    }).then(count => {
      if (!count) {
        return 0;
      }

      return count;
    });
  }

  async _getAllowance(permission, options = {
    transacting: null,
  }) {
    const permissionOptions = new FetchPermissionAllowanceOptions({
      transacting: options.transacting,
      permission: new PermissionWrapper(permission),
      scope: new PermissionScope({
        type: PermissionScope.TYPE_USER,
        instance: this.getID(),
      }),
      accessLevel: new AccessLevelInput({
        accessLevel: AccessLevelInput.WRITE,
      }),
    });
    return this.getPermissionManager().getPermissionAllowanceLimit(permissionOptions);
  }

  getFunnelLimit(options = {
    transacting: null,
  }) {
    return this._getAllowance(Permissions.TYPE_FUNNELS_ALLOWANCE, options);
  }

  getWorkspaceLimit(options = {
    transacting: null,
  }) {
    return this._getAllowance(Permissions.TYPE_WORKSPACES_ALLOWANCE, options);
  }

  hasAccessToNewVersion(transacting = null) {
    return modelsDashboard.UserMeta.forge().where({
      user: this.getID(),
      key: User.AccessToNewVersionKey,
      value_bool: true,
    }).count({
      transacting,
    }).then(result => {
      if (result >= 1) {
        return true;
      }

      return false;
    });
  }
};

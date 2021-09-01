const express = require('express');

const router = express.Router();
const Promise = require('bluebird');
const _ = require('lodash');

const {
  serializer:
  JSONAPI,
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
const {
  constants: {
    Permissions,
  },
} = require('@funnelytics/utilities');

const EmailHelper = require('../lib/emails/EmailHelper');

router.get(['/', '/find'], (req, res, next) => {
  const withRelated = [{
    user(qb) {
      qb.column('id', 'email', 'first_name', 'last_name');
    },
  }];

  return BookshelfDashboard.transaction(async transacting => {
    const permissionManager = new PermissionManager(req.user.id);
    const permissionOptions = new FetchPermissionOptions({
      transacting,
      permission: new PermissionWrapper(Permissions.TYPE_STARTER),
      scope: new PermissionScope({
        type: PermissionScope.TYPE_USER,
        instance: req.user.id,
      }),
      accessLevel: new AccessLevelInput({ accessLevel: AccessLevelInput.READ }),
    });

    const permissionResponse = await permissionManager.fetchPermissionResponse(permissionOptions);

    if (!permissionResponse.getHasPermission()) {
      throw errors.predefined.generic.forbidden;
    }
    return modelsDashboard.ProjectClient.forge().query(qb => {
      qb.where(whereQuery => {
        whereQuery.whereIn('project_clients.project', whereInQuery => {
          whereInQuery.select('id').from('projects');
          whereInQuery.where('user', req.user.id);
          whereInQuery.whereNull('deleted_at');
        });
        whereQuery.orWhere(orWhereQuery => {
          orWhereQuery.where('project_clients.user', req.user.id);
        });
      });
      const projectIdFilter = _.get(req, ['query', 'filter', 'project']);
      if (projectIdFilter) {
        qb.andWhere('project_clients.project', projectIdFilter);
      }
    }).fetchAll({
      withRelated,
    });
  }).then(projectClients => {
    return JSONAPI.serializeAsync('project-client', projectClients.toJSON());
  }).then(body => {
    return res.json(body);
  }).catch(err => {
    return next(err);
  });
});

// router.get(['/:id', '/find/:id'], (req, res, next) => {
//   console.log('WE SHOULD NOT SEE THIS AT THIS POINT');
//   return BookshelfDashboard.transaction(async transacting => {
//     const permissionManager = new PermissionManager(req.user.id);
//     const permissionOptions = new FetchPermissionOptions({
//       transacting,
//       permission: new PermissionWrapper(Permissions.TYPE_COLLABORATE),
//       scope: new PermissionScope({
//         type: PermissionScope.TYPE_PROJECT,
//         instance: _.get(req, ['query', 'filter', 'project']),
//       }),
//       accessLevel: new AccessLevelInput({ accessLevel: AccessLevelInput.ADMIN }),
//     });

//     const permissionResponse = await permissionManager.fetchPermissionResponse(permissionOptions);

//     if (!permissionResponse.getHasPermission()) {
//       throw errors.predefined.generic.forbidden;
//     }

//     return modelsDashboard.ProjectClient.forge().where(req.query.filter || {}).fetchAll({
//       transacting,
//       withRelated: req.query.include || [],
//     });
//   }).then(projectClients => {
//     return JSONAPI.serializeAsync('project-client', projectClients.toJSON());
//   }).then(body => {
//     return res.json(body);
//   }).catch(err => {
//     return next(err);
//   });
// });

router.patch(['/:id', '/edit/:id'], (req, res, next) => {
  req.body = JSONAPI.deserialize('project-client', req.body);
  return Promise.try(() => {
    return modelsDashboard.ProjectClient.getSchema().validateAsync(
      req.body,
      { stripUnknown: true },
    );
  }).catch(err => {
    throw errors.fromJoi(err);
  }).then(validated => {
    return BookshelfDashboard.transaction(async transacting => {
      const permissionManager = new PermissionManager(req.user.id);
      const permissionOptions = new FetchPermissionOptions({
        transacting,
        permission: new PermissionWrapper(Permissions.TYPE_COLLABORATE),
        scope: new PermissionScope({
          type: PermissionScope.TYPE_PROJECT,
          instance: validated.project,
        }),
        accessLevel: new AccessLevelInput({ accessLevel: AccessLevelInput.ADMIN }),
      });

      const permissionResponse = await permissionManager.fetchPermissionResponse(permissionOptions);

      if (!permissionResponse.getHasPermission()) {
        throw errors.predefined.generic.forbidden;
      }

      return modelsDashboard.ProjectClient.forge().where({
        id: req.body.id,
        project: validated.project,
      }).save(validated, {
        transacting,
        patch: true,
        returning: ['id', 'email', 'permissions'],
      });
    });
  }).then(projectClient => {
    return JSONAPI.serializeAsync('project-client', projectClient.toJSON());
  }).then(body => {
    return res.status(201).json(body);
  }).catch(err => {
    return next(err);
  });
});

router.post('/invite', (req, res, next) => {
  const newClient = _.get(req, ['body', 'newClient'], {});
  const clientEmail = _.get(newClient, 'email', '').toLowerCase();
  const clientFirstName = _.get(newClient, 'first_name', null);
  const clientLastName = _.get(newClient, 'last_name', null);
  const clientPermissions = parseInt(_.get(newClient, 'permissions', null), 10);
  const projectId = _.get(req, ['body', 'project', 'id'], null);
  const projectName = _.get(req, ['body', 'project', 'name'], null);

  if (!clientEmail) {
    throw errors.predefined.users.mismatch;
  } else if (!projectId || !projectName) {
    throw errors.predefined.generic.nonexistent;
  } else if (![0, 1].includes(clientPermissions)) {
    throw errors.predefined.generic.unauthorized;
  }

  return BookshelfDashboard.transaction(async transacting => {
    const permissionManager = new PermissionManager(req.user.id);
    const permissionOptions = new FetchPermissionOptions({
      transacting,
      permission: new PermissionWrapper(Permissions.TYPE_COLLABORATE),
      scope: new PermissionScope({
        type: PermissionScope.TYPE_PROJECT,
        instance: projectId,
      }),
      accessLevel: new AccessLevelInput({ accessLevel: AccessLevelInput.ADMIN }),
    });

    const permissionResponse = await permissionManager.fetchPermissionResponse(permissionOptions);

    if (!permissionResponse.getHasPermission()) {
      throw errors.predefined.generic.forbidden;
    }

    const { invitingUser, projectClientAlreadyExists, client } = await Promise.props({
      invitingUser: modelsDashboard.User.forge().where({
        id: req.user.id,
      }).fetch({
        transacting,
        columns: ['email'],
      }),
      projectClientAlreadyExists: modelsDashboard.ProjectClient.forge().where({
        project: projectId,
        email: clientEmail,
      }).fetch({
        transacting,
        columns: ['id'],
      }),
      client: modelsDashboard.User.forge().where({
        email: clientEmail,
      }).fetch({
        transacting,
      }),
    });

    if (!invitingUser) {
      throw errors.predefined.generic.unauthorized;
    }

    if (projectClientAlreadyExists) {
      throw errors.predefined.users.exists;
    }

    const clientId = client ? client.get('id') : null;
    const clientName = client && client.get('first_name') ? client.get('first_name') : `${clientFirstName} ${clientLastName}`;

    const clientModel = await modelsDashboard.ProjectClient.forge().save({
      project: projectId,
      user: clientId,
      email: clientEmail,
      permissions: clientPermissions,
    }, {
      transacting,
      returning: ['id'],
    });

    return EmailHelper.send(
      clientEmail,
      'noresponse@funnelytics.io',
      'You\'ve been invited to a Funnelytics.io Workspace',
      [
        `<p>Hey, ${clientName}!</p> `,
        `<p>You have been invited by ${invitingUser.get('email')} to collaborate on ${projectName} at Funnelytics.io!</p> `,
        '<p>Funnelytics is a visually mapping and analytics tool for your marketing funnels.</p> ',
        `<p><a href="${process.env.APP_URL}/login">Click HERE</a> to join the workspace and get more clarity on your marketing data today!</p>`,
        '<p>- The Funnelytics Team</p>',
      ].join(''),
    ).then(() => {
      return modelsDashboard.ProjectClient.forge().where({
        id: clientModel.get('id'),
      }).fetch({
        transacting,
        withRelated: [{
          user(qb) {
            qb.column('id', 'email', 'first_name', 'last_name');
          },
        }],
      });
    });
  }).then(body => {
    return JSONAPI.serializeAsync('project-client', body.toJSON());
  }).then(body => {
    return res.status(201).json(body);
  }).catch(err => {
    return next(err);
  });
});

router.post('/:id/client', (req, res, next) => {
  const newClient = {
    user: req.body.user,
    project: req.body.project,
    permissions: Number(req.body.permissions),
  };

  return BookshelfDashboard.transaction(async transacting => {
    const permissionManager = new PermissionManager(req.user.id);
    const permissionOptions = new FetchPermissionOptions({
      transacting,
      permission: new PermissionWrapper(Permissions.TYPE_COLLABORATE),
      scope: new PermissionScope({
        type: PermissionScope.TYPE_PROJECT,
        instance: req.body.project,
      }),
      accessLevel: new AccessLevelInput({ accessLevel: AccessLevelInput.ADMIN }),
    });

    const permissionResponse = await permissionManager.fetchPermissionResponse(permissionOptions);

    if (!permissionResponse.getHasPermission()) {
      throw errors.predefined.generic.forbidden;
    }

    return Promise.try(() => {
      return modelsDashboard.ProjectClient.getSchema().validateAsync(newClient, {
        stripUnknown: true,
      });
    }).catch(err => {
      throw errors.fromJoi(err);
    }).then(validated => {
      return modelsDashboard.ProjectClient.forge(validated).save({}, {
        transacting,
      });
    });
  }).then(clientRelation => {
    return JSONAPI.serializeAsync('project-client', clientRelation.toJSON());
  }).then(body => {
    return res.status(201).json(body);
  }).catch(err => {
    return next(err);
  });
});

router.delete(['/:id', '/delete/:id'], (req, res, next) => {
  return BookshelfDashboard.transaction(async transacting => {
    const projectClient = await modelsDashboard.ProjectClient.forge().where({
      id: req.params.id,
    }).fetch({
      transacting,
      columns: ['project'],
    });
    if (!projectClient) {
      throw errors.predefined.generic.nonexistent;
    }

    const permissionManager = new PermissionManager(req.user.id);
    const permissionOptions = new FetchPermissionOptions({
      transacting,
      permission: new PermissionWrapper(Permissions.TYPE_COLLABORATE),
      scope: new PermissionScope({
        type: PermissionScope.TYPE_PROJECT,
        instance: projectClient.get('project'),
      }),
      accessLevel: new AccessLevelInput({ accessLevel: AccessLevelInput.ADMIN }),
    });

    const permissionResponse = await permissionManager.fetchPermissionResponse(permissionOptions);

    if (!permissionResponse.getHasPermission()) {
      throw errors.predefined.generic.forbidden;
    }
    return modelsDashboard.ProjectClient.forge().where({
      id: req.params.id,
    }).destroy({
      transacting,
    });
  }).then(deletedProjectClient => {
    return JSONAPI.serializeAsync('project-client', deletedProjectClient.toJSON());
  }).then(body => {
    return res.json(body);
  }).catch(err => {
    return next(err);
  });
});

module.exports = router;

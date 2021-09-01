const express = require('express');
const Joi = require('@hapi/joi');

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
const {
  constants: {
    Permissions,
  },
} = require('@funnelytics/utilities');

const { issueLogoUrl, getLogoUrl } = require('../lib/projects/custom-attributes');
const wrapAsync = require('../utils/asyncWrap');

const router = express.Router();

const projectIdSchema = Joi.object().keys({
  projectId: Joi.string().uuid({
    version: ['uuidv4'],
  }).required(),
});
const validateProjectId = async params => {
  try {
    const validatedParams = await projectIdSchema.validateAsync(params, {
      stripUnknown: true,
    });

    return validatedParams.projectId;
  } catch (err) {
    throw errors.fromJoi(err);
  }
};

const checkPermissions = async (userId, projectId, transacting) => {
  const permissionManager = new PermissionManager(userId);
  const permissionOptions = new FetchPermissionOptions({
    transacting,
    permission: new PermissionWrapper(Permissions.TYPE_PROJECT_CUSTOMIZATION),
    scope: new PermissionScope({
      type: PermissionScope.TYPE_PROJECT,
      instance: projectId,
    }),
    accessLevel: new AccessLevelInput({ accessLevel: AccessLevelInput.WRITE }),
  });

  const permissionResponse = await permissionManager.fetchPermissionResponse(permissionOptions);

  if (permissionResponse.getHasPermission()) {
    return;
  }

  throw errors.predefined.generic.forbidden;
};

const issueLogo = async (req, res) => {
  const projectId = await validateProjectId(req.params);

  await BookshelfDashboard.transaction(async (t) => {
    await checkPermissions(req.user.id, projectId, t);

    const key = `logos/${projectId}`;
    const url = await issueLogoUrl(key);

    return res.status(201).json({ url, key });
  });
};

const setLogo = async (req, res) => {
  const projectId = await validateProjectId(req.params);

  let validatedBody;

  try {
    validatedBody = await Joi.object().keys({
      key: Joi.string().required(),
    }).validateAsync(req.body, {
      stripUnknown: true,
    });
  } catch (err) {
    throw errors.fromJoi(err);
  }

  const key = validatedBody.key;

  await BookshelfDashboard.transaction(async (t) => {
    await checkPermissions(req.user.id, projectId, t);

    const attributes = await modelsDashboard.ProjectCustomAttribute.forge().where({
      project: projectId,
    }).fetch({
      transacting: t,
    });

    if (attributes) {
      await attributes.save({
        logo: key,
      }, {
        transacting: t,
      });
    } else {
      await modelsDashboard.ProjectCustomAttribute.forge({
        project: projectId,
        logo: key,
      }).save(null, {
        transacting: t,
      });
    }

    const url = await getLogoUrl(projectId, t);

    return res.status(201).json({
      url,
    });
  });
};

const deleteLogo = async (req, res) => {
  const projectId = await validateProjectId(req.params);

  const attributes = await modelsDashboard.ProjectCustomAttribute.forge().where({
    project: projectId,
  }).fetch();

  if (attributes) {
    await attributes.save({
      logo: null,
    });
  }

  return res.json({});
};

router.post('/:projectId/issue-logo', wrapAsync(issueLogo));

router.post('/:projectId/set-logo', wrapAsync(setLogo));

router.delete('/:projectId/delete-logo', wrapAsync(deleteLogo));

module.exports = router;

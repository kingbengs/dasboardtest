const express = require('express');

const router = express.Router();
const {
  models: {
    dashboard: modelsDashboard,
  },
  serializer: JSONAPI,
  errors,
  databases: {
    dashboard: BookshelfDashboard,
  },
} = require('@funnelytics/shared-data');
const Promise = require('bluebird');
// eslint-disable-next-line global-require
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Joi = require('@hapi/joi');

const compare = Promise.promisify(bcrypt.compare);
const hash = Promise.promisify(bcrypt.hash);

const _ = require('lodash');
const RequestUtil = require('../lib/requests/RequestUtil');
const EmailHelper = require('../lib/emails/EmailHelper');
const wrapAsync = require('../utils/asyncWrap');
const {
  USER_PAGINATION_PAGE_LENGTH,
  USER_PAGINATION_FIRST_PAGE,
} = require('../lib/pagination/users');
const EmailUpdater = require('../lib/account/email-update');
const UserCreator = require('../lib/users/UserCreator');
const PermissionConflict = require('../lib/account/PermissionConflict');
const PermissionConflictConstants = require('../lib/account/permission-conflict/PermissionConflictConstants');

const Pagination = require('../lib/pagination/Pagination');

const pagination = new Pagination(USER_PAGINATION_FIRST_PAGE, USER_PAGINATION_PAGE_LENGTH);

const createUserByEmailOnly = async (req, res) => {
  req.body = JSONAPI.deserialize('user', req.body);

  const ip = new RequestUtil(req).getIP();

  const user = await BookshelfDashboard.transaction(transacting => {
    const userCreator = new UserCreator(req.body);
    return userCreator.create({ ip, transacting, onlyByEmail: true });
  });

  await EmailHelper.sendTemplate(
    user.get('email'),
    'noresponse@funnelytics.io',
    'Welcome to Funnelytics!',
    'd-39c43c7f5c2d4aa9b8ae13f196c14db2',
  );

  const accessToken = jwt.sign({ id: user.get('id') }, process.env.TOKEN_SECRET);

  const userResponse = await JSONAPI.serializeAsync('user', user.toJSON());

  return res.status(201).json({ ...userResponse, access_token: accessToken });
};

const setPasswordSchema = Joi.object().keys({
  password: Joi.string().required(),
});

const setPassword = async (req, res) => {
  let password;

  try {
    password = (await setPasswordSchema.validateAsync(req.body)).password;
  } catch (err) {
    throw errors.fromJoi(err);
  }

  await BookshelfDashboard.transaction(async t => {
    const userId = req.user.id;
    const user = await modelsDashboard.User.forge().where({ id: userId }).fetch();

    if (user.get('password')) {
      throw errors.predefined.generic.forbidden;
    }

    const hashedPassword = await hash(password, 12);

    await user.save({
      password: hashedPassword,
    }, {
      transacting: t,
      patch: true,
    });
  });

  return res.status(201).json({});
};


// POST /create-by-email
router.post('/create-by-email', wrapAsync(createUserByEmailOnly));

// POST /, /create
router.post(['/', '/create'], (req, res, next) => {
  return Promise.try(() => {
    req.body = JSONAPI.deserialize('user', req.body);

    return BookshelfDashboard.transaction(transacting => {
      const userCreator = new UserCreator(req.body);
      return userCreator.create({
        ip: new RequestUtil(req).getIP(),
        transacting,
      });
    }).then(user => {
      return Promise.props({
        body: JSONAPI.serializeAsync('user', user.toJSON()),
        email: EmailHelper.sendTemplate(
          user.get('email'),
          'noresponse@funnelytics.io',
          'Welcome to Funnelytics!',
          'd-39c43c7f5c2d4aa9b8ae13f196c14db2',
        ),
      });
    }).then(({ body }) => {
      return res.status(201).json(body);
    });
  }).catch(err => {
    return next(err);
  });
});

// POST /compare-passwords
router.post('/compare-passwords', (req, res, next) => {
  return modelsDashboard.User.forge().where({
    id: req.user.id,
  }).fetch({
    columns: ['password'],
  }).then(user => {
    return compare(req.body.password, user.get('password') || '');
  }).then(matches => {
    return res.json({
      matches,
    });
  }).catch(err => {
    return next(err);
  });
});

// POST update-password
router.post('/update-password', (req, res, next) => {
  return BookshelfDashboard.transaction(transacting => {
    return modelsDashboard.User.forge().where({
      id: req.user.id,
    }).fetch({
      transacting,
      columns: ['password'],
    }).then(user => {
      return compare(req.body.current, user.get('password') || '');
    }).then(matches => {
      if (!matches) {
        throw new errors.AppError(
          401,
          'Incorrect Password',
          'Your current password must be correct',
        );
      }
      return hash(req.body.updated, 12);
    }).then(hashed => {
      return modelsDashboard.User.forge().where({
        id: req.user.id,
      }).save({
        password: hashed,
      }, {
        transacting,
        patch: true,
        method: 'update',
        returning: '*',
      });
    });
  }).then(() => {
    return res.json({
      updated: true,
    });
  }).catch(err => {
    return next(err);
  });
});

// POST set-password
router.post('/set-password', wrapAsync(setPassword));

// GET /:id, /find/:id
router.get(['/:id', '/find/:id'], (req, res, next) => {
  return BookshelfDashboard.transaction(t => {
    const requests = {
      user: modelsDashboard.User.forge().where('id', req.user.id).fetch({
        columns: ['role'],
        transacting: t,
      }),
    };
    return Promise.props(requests).then(result => {
      if (!result.user) {
        throw errors.predefined.users.nonexistent;
      }
      const isNotAdmin = result.user.get('role') <= 3;
      const isNotGettingOwnUserInformation = req.params.id !== req.user.id;
      if (isNotAdmin && isNotGettingOwnUserInformation) {
        throw errors.predefined.generic.unauthorized;
      }

      const relations = [];

      if ((req.params.id || '').toLowerCase() === req.user.id.toLowerCase()) {
        relations.push('meta_properties');
      }

      return Promise.props({
        user: modelsDashboard.User.forge(req.query.filter || {}).where({
          id: req.params.id,
        }).fetch({
          withRelated: [
            ...(req.query.include || []),
            'meta_properties',
          ] || ['meta_properties'],
          transacting: t,
        }),
      });
    });
  }).then(result => {
    return JSONAPI.serializeAsync('user', result.user.toJSON());
  }).then(body => {
    return res.json(body);
  }).catch(err => {
    return next(err);
  });
});

// TODO: Validate page input
// GET /, /find
router.get(['/', '/find'], (req, res, next) => {
  const EMAIL_QUERY_OMITTED = null;
  const emailQuery = _.get(req, ['query', 'query'], EMAIL_QUERY_OMITTED);

  return BookshelfDashboard.transaction(t => {
    return modelsDashboard.User.forge().where('id', req.user.id).fetch({
      columns: ['role'],
      transacting: t,
    }).then(user => {
      if (user.get('role') <= 3) {
        throw errors.predefined.generic.unauthorized;
      }

      const model = modelsDashboard.User
        .forge()
        .where(req.query.filter || {});
      if (emailQuery !== EMAIL_QUERY_OMITTED) {
        model.where('email', 'LIKE', `%${emailQuery}%`);
      }
      return Promise.props({
        page: model
          .clone()
          .query(qb => {
            qb.orderBy('created_at', 'ASC');
          })
        // .fetchAll( {
        //   transacting: t,
        //   withRelated: req.query.include || []
        // } ),
          .fetchPage({
            pageSize: USER_PAGINATION_PAGE_LENGTH,
            page: pagination.getCurrentPage(req),
            transacting: t,
            withRelated: req.query.include || [],
          }),
        count: model
          .clone()
          .count({
            transacting: t,
          }),
      });
    });
  }).then(result => {
    const links = pagination.getJSONAPILinks(req, result.count);

    return JSONAPI.serializeAsync('user', result.page.toJSON(), {
      links,
    });
  }).then(body => {
    return res.json(body);
  }).catch(err => {
    return next(err);
  });
});

// PATCH /:id, /edit/:id
router.patch(['/:id', '/edit/:id'], async (req, res, next) => {
  let userId;
  let wasInConflict = false; // stores whether user permissions were in conflict prior to membership change
  return Promise.try(() => {
    _.each(_.get(req, ['body', 'data', 'relationships'], []), (val, key) => {
      if (val.data == null || val.data instanceof Array) {
        delete req.body.data.relationships[key];
      }
    });
    req.body = JSONAPI.deserialize('user', req.body);

    let newEmail = null;

    if (!req.body.id) {
      req.body.id = req.params.id;
    }

    if (req.body.email) {
      newEmail = req.body.email;
      if (EmailHelper.isBlacklisted(newEmail)) {
        return new Promise((resolve, reject) => {
          setTimeout(() => {
            reject(new Error(`Couldn't update user with new email ${newEmail}. This email has been blacklisted.`));
          }, Math.floor(1500 + Math.random() * 3000));
        });
      }
    }

    delete req.body.email;
    delete req.body.password;

    return BookshelfDashboard.transaction(transacting => {
      return modelsDashboard.User.forge({
        id: req.user.id,
      }).fetch({
        transacting,
        columns: ['role'],
      }).then(async user => {
        const allowedAttributes = ['first_name', 'last_name', 'tapfiliate_referrer'];
        if (!user) {
          throw errors.predefined.generic.unauthorized;
        }
        if (req.user.id !== req.params.id) {
          if (user.get('role') <= 3) {
            throw errors.predefined.generic.unauthorized;
          } else {
            allowedAttributes.push('membership');

            userId = req.params.id;

            [wasInConflict] = await Promise.all([
              PermissionConflict.isInConflictAsync({
                userId,
                permissions: PermissionConflictConstants.PERMISSIONS_SESSIONS,
                transacting,
              }),
            ]);
          }
        }
        return Promise.props({
          user,
          saved: modelsDashboard.User.forge().where('id', req.params.id).save(_.pick(req.body, allowedAttributes), {
            transacting,
            patch: true,
            returning: ['id', 'first_name', 'email'],
          }),
        });
      }).then(result => {
        return Promise.try(() => {
          if (!newEmail || result.saved.get('email') === newEmail) {
            return result.saved;
          }

          return EmailUpdater.createNewUpdate({
            userId: result.saved.get('id'),
            userNewEmail: newEmail,
            firstName: result.saved.get('first_name'),
          }, transacting).then(() => {
            return result.saved;
          });
        });
      });
    }).then(user => {
      return JSONAPI.serializeAsync('user', user.toJSON());
    }).then(body => {
      return res.json(body);
    }).then(async () => {
      if (!userId) {
        return null;
      }

      return BookshelfDashboard.transaction(transacting => {
        return Promise.all([
          PermissionConflict.announceConflictChange({
            userId,
            permissions: PermissionConflictConstants.PERMISSIONS_SESSIONS,
            previousState: wasInConflict,
            transacting,
          }),
        ]);
      });
    });
  }).catch(err => {
    return next(err);
  });
});

// DELETE /:id, /delete/:id
router.delete(['/:id', '/delete/:id'], (req, res, next) => {
  BookshelfDashboard.transaction(t => {
    return modelsDashboard.User.forge().where('id', req.user.id).fetch({
      transacting: t,
      columns: ['role'],
    }).then(user => {
      if (req.user.id !== req.params.id) {
        if (user.get('role') <= 3) {
          throw errors.predefined.generic.unauthorized;
        }
      }
      return modelsDashboard.User.forge({
        id: req.params.id,
      }).destroy({
        transacting: t,
      });
    });
  }).then(() => {
    return JSONAPI.serializeAsync('user', {});
  }).then(body => {
    return res.json(body);
  }).catch(err => {
    return next(err);
  });
});

module.exports = router;

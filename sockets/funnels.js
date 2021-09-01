const socketioJwt = require('socketio-jwt');
const {
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

const checkPermissions = (userId, funnelId) => {
  return BookshelfDashboard.transaction(async t => {
    const permissionManager = new PermissionManager(userId);
    const permissionOptions = new FetchPermissionOptions({
      transacting: t,
      permission: new PermissionWrapper(Permissions.TYPE_STARTER),
      scope: new PermissionScope({
        type: PermissionScope.TYPE_FUNNEL,
        instance: funnelId,
      }),
      accessLevel: new AccessLevelInput({ accessLevel: AccessLevelInput.READ }),
    });

    const permissionResponse = await permissionManager.fetchPermissionResponse(permissionOptions);

    return permissionResponse.getHasPermission();
  });
};

const wrapHandler = (handler, socket, namespace) => {
  return data => {
    handler(data, socket, namespace);
  };
};

const generateFunnelRoomId = funnelId => `${funnelId}`;
const generateFunnelWaitingRoomId = funnelId => `waiting-${funnelId}`;

const onOpenFunnel = async ({ funnelId }, socket, namespace) => {
  const hasPermissions = await checkPermissions(socket.user.id, funnelId);

  if (!hasPermissions) {
    return;
  }

  const funnelRoom = generateFunnelRoomId(funnelId);
  const funnelWaitingRoom = generateFunnelWaitingRoomId(funnelId);

  namespace.in(funnelRoom).clients((error, clients) => {
    if (error) {
      throw error;
    }

    if (!clients || !clients.length) {
      socket.join(funnelRoom, () => {
        socket.to(funnelWaitingRoom).emit('notify about user', {
          funnelId,
          user: {
            ...socket.user,
            socketId: socket.id
          }
        });

        socket.to(funnelRoom).emit('kicked from funnel', {
          funnelId,
          user: {
            ...socket.user,
            socketId: socket.id
          }
        });
      });
      return;
    }

    socket.join(funnelWaitingRoom, () => {
      socket.to(funnelRoom).emit('joined to waiting room', {
        funnelId,
        user: {
          ...socket.user,
          socketId: socket.id
        }
      });
    });
  });
};

const onNotifyAboutMe = async ({ funnelId }, socket) => {
  const hasPermissions = await checkPermissions(socket.user.id, funnelId);

  if (!hasPermissions) {
    return;
  }

  const funnelWaitingRoom = generateFunnelWaitingRoomId(funnelId);

  socket.to(funnelWaitingRoom).emit('notify about user', {
    funnelId,
    user: {
      ...socket.user,
      socketId: socket.id
    }
  });
};

const onKickFromFunnel = async ({ funnelId }, socket) => {
  const hasPermissions = await checkPermissions(socket.user.id, funnelId);

  if (!hasPermissions) {
    return;
  }

  const funnelRoom = generateFunnelRoomId(funnelId);
  const funnelWaitingRoom = generateFunnelWaitingRoomId(funnelId);

  socket.leave(funnelWaitingRoom, () => {
    socket.join(funnelRoom, () => {
      socket.to(funnelWaitingRoom).emit('notify about user', {
        funnelId,
        user: {
          ...socket.user,
          socketId: socket.id
        }
      });

      socket.to(funnelRoom).emit('kicked from funnel', {
        funnelId,
        user: {
          ...socket.user,
          socketId: socket.id
        }
      });
    });
  });
};

const init = (io) => {
  const funnelsNamespace = io.of('/funnels');

  funnelsNamespace.use(socketioJwt.authorize({
    secret: process.env.TOKEN_SECRET,
    handshake: true,
  }));

  funnelsNamespace.use(async (socket, next) => {
    const userId = socket.decoded_token.id;
    const user = await modelsDashboard.User.forge().where({ id: userId }).fetch({
      columns: ['id', 'first_name', 'last_name'],
    });

    socket.user = user.toJSON();

    next();
  });

  funnelsNamespace.on('connect', socket => {
    socket.on('open funnel', wrapHandler(onOpenFunnel, socket, funnelsNamespace));
    socket.on('notify about me', wrapHandler(onNotifyAboutMe, socket, funnelsNamespace));
    socket.on('kick from funnel', wrapHandler(onKickFromFunnel, socket, funnelsNamespace));
  });
};

module.exports = init;

const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');

let realtimeServer = null;
const socketOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  ...(process.env.CLIENT_URL ? process.env.CLIENT_URL.split(',').map((origin) => origin.trim()).filter(Boolean) : []),
];

const normalizeRole = (role) => String(role || '').trim().toLowerCase().replace('department_head', 'dept_head').replace('depthead', 'dept_head');

const initSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (socketOrigins.includes(origin)) return callback(null, true);
        if (process.env.NODE_ENV !== 'production') return callback(null, true);
        return callback(new Error('Socket origin is not allowed.'), false);
      },
      methods: ['GET', 'POST'],
      credentials: true,
      allowedHeaders: ['Authorization', 'Content-Type'],
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true,
    allowUpgrades: true,
  });
  realtimeServer = io;
  const jwtSecret = process.env.JWT_SECRET || 'change-this-secret';

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== 'string' || !token.trim()) {
      return next(new Error('Authentication error'));
    }

    try {
      jwt.verify(token.trim(), jwtSecret, (error, user) => {
        if (error || !user?.id) return next(new Error('Authentication error'));
        socket.user = user;
        next();
      });
    } catch (error) {
      return next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    console.log('[SOCKET] Client connected:', socket.id);
    socket.on('join_rooms', ({ userId, role } = {}) => {
      const authenticatedUserId = Number(socket.user.id);
      const requestedUserId = Number(userId);
      const normalizedRole = normalizeRole(role || socket.user.role || socket.user.user_role);

      if (requestedUserId === authenticatedUserId) {
        socket.join(`user_${authenticatedUserId}`);
      }
      if (normalizedRole) {
        socket.join(`role_${normalizedRole}`);
      }
      socket.join('all_users');
    });
  });

  return io;
};

module.exports = { initSocket };

const emitEvaluationUpdate = (payload = {}) => {
  if (realtimeServer) realtimeServer.to('all_users').emit('evaluation_updated', payload);
};

module.exports.emitEvaluationUpdate = emitEvaluationUpdate;

import { io } from 'socket.io-client';

const isLocalHost = typeof window !== 'undefined'
  && ['localhost', '127.0.0.1'].includes(window.location.hostname);
const socketUrl = import.meta.env.VITE_SOCKET_URL
  || (typeof window === 'undefined' || isLocalHost ? 'http://localhost:5005' : window.location.origin);

const getSocketAuthToken = () => {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem('ipesAuthToken') || window.localStorage.getItem('token') || '';
};

const socket = io(socketUrl, {
  autoConnect: false,
  path: '/socket.io',
  transports: ['websocket', 'polling'],
  rememberUpgrade: false,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  timeout: 10000,
  closeOnBeforeunload: true,
  withCredentials: true,
  auth: {
    token: getSocketAuthToken(),
  },
});

const refreshSocketAuth = () => {
  if (!socket) return;
  socket.auth = { token: getSocketAuthToken() };
};

const originalConnect = socket.connect.bind(socket);

const safeConnect = () => {
  const token = getSocketAuthToken();
  if (!token) {
    if (socket.connected || socket.connecting) socket.disconnect();
    return false;
  }
  refreshSocketAuth();
  if (!socket.connected && !socket.connecting) {
    originalConnect();
  }
  return true;
};

socket.connect = (...args) => {
  const token = getSocketAuthToken();
  if (!token) {
    if (socket.connected || socket.connecting) socket.disconnect();
    return undefined;
  }
  refreshSocketAuth();
  return originalConnect(...args);
};

socket.on('connect_error', (error) => {
  if (error?.message === 'Authentication error') {
    refreshSocketAuth();
    socket.disconnect();
  }
});

if (typeof window !== 'undefined') {
  window.addEventListener('storage', refreshSocketAuth);
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    socket.disconnect();
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', refreshSocketAuth);
    }
  });
}

export { safeConnect };
export default socket;

const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3000';

let socket: WebSocket | null = null;
const listeners = new Map<string, Set<(payload: any) => void>>();

const toWebSocketUrl = (url: string) => {
  if (url.startsWith('ws://') || url.startsWith('wss://')) {
    return url;
  }
  if (url.startsWith('https://')) {
    return url.replace('https://', 'wss://');
  }
  return url.replace('http://', 'ws://');
};

let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
let shouldReconnect = false;

const scheduleReconnect = () => {
  if (!shouldReconnect || reconnectTimer) {
    return;
  }
  const delay = Math.min(30000, 1000 * 2 ** Math.min(reconnectAttempts, 5));
  reconnectAttempts += 1;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (shouldReconnect) {
      connect();
    }
  }, delay);
};

const connect = () => {
  socket = new WebSocket(toWebSocketUrl(WS_URL));

  socket.addEventListener('open', () => {
    reconnectAttempts = 0;
    console.log('WebSocket connected');
  });

  socket.addEventListener('close', () => {
    console.log('WebSocket disconnected');
    scheduleReconnect();
  });

  socket.addEventListener('error', () => {
    // close event follows; reconnect handled there.
  });

  socket.addEventListener('message', (event) => {
    try {
      const data = JSON.parse(event.data);
      const type = data?.type;
      if (!type) {
        return;
      }
      const handlers = listeners.get(type);
      if (!handlers) {
        return;
      }
      handlers.forEach((handler) => handler(data));
    } catch (error) {
      // Ignore malformed messages.
    }
  });

  return socket;
};

export const initializeWebSocket = (_token?: string) => {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return socket;
  }
  shouldReconnect = true;
  return connect();
};

export const getSocket = () => socket;

export const disconnectWebSocket = () => {
  shouldReconnect = false;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (socket) {
    socket.close();
    socket = null;
  }
};

// Event type definitions
export interface WebSocketEvents {
  'job:created': (job: any) => void;
  'job:updated': (job: any) => void;
  'job:approved': (job: any) => void;
  'job:completed': (job: any) => void;
  'queue:optimized': (data: any) => void;
  'printer:status': (data: { printerId: string; status: string }) => void;
}

export const subscribeToEvent = <K extends keyof WebSocketEvents>(
  event: K,
  callback: WebSocketEvents[K]
) => {
  if (!listeners.has(event)) {
    listeners.set(event, new Set());
  }
  const handlers = listeners.get(event);
  handlers?.add(callback as (payload: any) => void);
  return () => {
    handlers?.delete(callback as (payload: any) => void);
  };
};

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

export const initializeWebSocket = (_token?: string) => {
  if (socket && socket.readyState === WebSocket.OPEN) {
    return socket;
  }

  socket = new WebSocket(toWebSocketUrl(WS_URL));

  socket.addEventListener('open', () => {
    console.log('WebSocket connected');
  });

  socket.addEventListener('close', () => {
    console.log('WebSocket disconnected');
  });

  socket.addEventListener('error', (error) => {
    console.error('WebSocket connection error:', error);
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

export const getSocket = () => socket;

export const disconnectWebSocket = () => {
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
  'queue:optimized': (data: any) => void;
  'printer:status': (data: { printerId: number; status: string }) => void;
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

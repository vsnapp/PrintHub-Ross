import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';

let wss: WebSocketServer | null = null;

export function initWebSocket(server: Server): WebSocketServer {
  wss = new WebSocketServer({ server });

  wss.on('connection', (ws) => {
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        switch (data.type) {
          case 'subscribe:jobs':
            ws.send(JSON.stringify({ type: 'subscribed', channel: 'jobs' }));
            break;
          case 'subscribe:printers':
            ws.send(JSON.stringify({ type: 'subscribed', channel: 'printers' }));
            break;
          case 'ping':
            ws.send(JSON.stringify({ type: 'pong' }));
            break;
          default:
            ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    });

    ws.send(JSON.stringify({
      type: 'connected',
      message: 'Connected to Print Farm Orchestrator',
    }));
  });

  return wss;
}

/**
 * Broadcast an event to every connected client. Events carry only ids/statuses;
 * clients re-fetch details through the authenticated REST API.
 */
export function broadcast(type: string, payload: Record<string, unknown> = {}) {
  if (!wss) {
    return;
  }
  const message = JSON.stringify({ type, ...payload, timestamp: new Date().toISOString() });
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

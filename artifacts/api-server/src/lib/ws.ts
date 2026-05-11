import type { Server as HttpServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { logger } from "./logger";

export type LiveEvent =
  | { type: "event_created"; eventId: number; title: string; submittedBy: string | null }
  | { type: "event_updated"; eventId: number }
  | { type: "event_moved"; eventId: number }
  | { type: "event_deleted"; eventId: number };

let wss: WebSocketServer | null = null;

const PING_INTERVAL_MS = 25_000;

export function attachWebSocketServer(server: HttpServer): void {
  wss = new WebSocketServer({ server, path: "/api/live" });

  // Keep connections alive with periodic ping
  const pingTimer = setInterval(() => {
    if (!wss) return;
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.ping();
      }
    }
  }, PING_INTERVAL_MS);

  wss.on("connection", (socket) => {
    logger.info({ clients: wss?.clients.size }, "WebSocket client connected");

    // Send hello so the client knows the connection is alive
    socket.send(JSON.stringify({ type: "hello" }));

    // Respond to pong (sent automatically by ws library, but track liveness)
    (socket as WebSocket & { isAlive?: boolean }).isAlive = true;
    socket.on("pong", () => {
      (socket as WebSocket & { isAlive?: boolean }).isAlive = true;
    });

    // Ignore any messages from client (read-only stream)
    socket.on("message", () => {});

    socket.on("close", () => {
      logger.info({ clients: wss?.clients.size }, "WebSocket client disconnected");
    });

    socket.on("error", (err) => {
      logger.warn({ err: err.message }, "WebSocket client error");
    });
  });

  wss.on("error", (err) => {
    logger.error({ err: err.message }, "WebSocket server error");
  });

  wss.on("close", () => {
    clearInterval(pingTimer);
  });

  logger.info("WebSocket server attached at /api/live");
}

export function broadcast(event: LiveEvent): void {
  if (!wss) return;
  const payload = JSON.stringify(event);
  let sent = 0;
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(payload);
        sent++;
      } catch (err) {
        logger.warn({ err }, "Broadcast send failed");
      }
    }
  }
  logger.info({ event: event.type, sent }, "WebSocket broadcast");
}

import type { Server as HttpServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { logger } from "./logger";

export type LiveEvent =
  | { type: "event_created"; eventId: number; title: string; submittedBy: string | null }
  | { type: "event_updated"; eventId: number }
  | { type: "event_moved"; eventId: number }
  | { type: "event_deleted"; eventId: number };

let wss: WebSocketServer | null = null;

export function attachWebSocketServer(server: HttpServer): void {
  wss = new WebSocketServer({ server, path: "/api/live" });

  wss.on("connection", (socket) => {
    logger.info({ clients: wss?.clients.size }, "WebSocket client connected");
    socket.send(JSON.stringify({ type: "hello" }));

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

  logger.info("WebSocket server attached at /api/live");
}

export function broadcast(event: LiveEvent): void {
  if (!wss) return;
  const payload = JSON.stringify(event);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(payload);
      } catch (err) {
        logger.warn({ err }, "Broadcast send failed");
      }
    }
  }
}

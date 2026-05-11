import http from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { startTelegramBot } from "./lib/telegram-bot";
import { attachWebSocketServer } from "./lib/ws";
import router from "./routes";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = http.createServer(app);
attachWebSocketServer(server);

server.listen(port, () => {
  logger.info({ port }, "Server listening");
  startTelegramBot(router).catch((err) => {
    logger.error({ err }, "Failed to start Telegram bot");
  });
});

server.on("error", (err) => {
  logger.error({ err }, "Error listening on port");
  process.exit(1);
});

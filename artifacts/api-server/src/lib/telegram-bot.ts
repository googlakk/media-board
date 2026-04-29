import TelegramBot from "node-telegram-bot-api";
import { db, eventsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "./logger";

type SessionStep =
  | "idle"
  | "awaitingTitle"
  | "awaitingDate"
  | "awaitingLocation"
  | "awaitingDescription";

interface Session {
  step: SessionStep;
  title?: string;
  eventDate?: Date | null;
  location?: string | null;
  description?: string | null;
  submittedBy: string;
}

const sessions = new Map<number, Session>();

function whoSubmitted(msg: TelegramBot.Message): string {
  const from = msg.from;
  if (!from) return "—";
  const name = [from.first_name, from.last_name].filter(Boolean).join(" ").trim();
  if (from.username) {
    return name ? `${name} (@${from.username})` : `@${from.username}`;
  }
  return name || `id:${from.id}`;
}

function parseDate(input: string): Date | null {
  const s = input.trim();
  if (!s || /^(пропустить|skip|-)$/i.test(s)) return null;

  // Try various formats
  // dd.mm.yyyy hh:mm | dd.mm hh:mm | dd.mm.yyyy | dd.mm
  const ddmmyyyyhhmm = s.match(
    /^(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?(?:\s+(\d{1,2}):(\d{2}))?$/,
  );
  if (ddmmyyyyhhmm) {
    const [, dd, mm, yyyy, hh, mi] = ddmmyyyyhhmm;
    const now = new Date();
    let year = yyyy ? parseInt(yyyy, 10) : now.getFullYear();
    if (year < 100) year += 2000;
    const month = parseInt(mm, 10) - 1;
    const day = parseInt(dd, 10);
    const hour = hh ? parseInt(hh, 10) : 12;
    const minute = mi ? parseInt(mi, 10) : 0;
    const d = new Date(year, month, day, hour, minute);
    if (!isNaN(d.getTime())) return d;
  }

  // Try ISO
  const iso = new Date(s);
  if (!isNaN(iso.getTime())) return iso;

  return null;
}

function emptyOrNull(s: string | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  if (!t || /^(пропустить|skip|-)$/i.test(t)) return null;
  return t;
}

async function nextPosition(status: "new"): Promise<number> {
  const [row] = await db
    .select({
      max: sql<number>`COALESCE(MAX(${eventsTable.position}), -1)`,
    })
    .from(eventsTable)
    .where(eq(eventsTable.status, status));
  return (row?.max ?? -1) + 1;
}

export function startTelegramBot(): void {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    logger.warn("TELEGRAM_BOT_TOKEN not set — Telegram bot disabled");
    return;
  }

  const bot = new TelegramBot(token, { polling: true });

  bot.on("polling_error", (err) => {
    logger.error({ err: err.message }, "Telegram polling error");
  });

  const help =
    "Привет! Я бот медиа-отдела школы.\n\n" +
    "Я помогу подать заявку на съёмку мероприятия.\n\n" +
    "Команды:\n" +
    "/new — добавить новое мероприятие\n" +
    "/cancel — отменить текущую заявку\n" +
    "/help — показать эту справку";

  bot.onText(/^\/start/, (msg) => {
    sessions.delete(msg.chat.id);
    bot.sendMessage(msg.chat.id, help);
  });

  bot.onText(/^\/help/, (msg) => {
    bot.sendMessage(msg.chat.id, help);
  });

  bot.onText(/^\/cancel/, (msg) => {
    sessions.delete(msg.chat.id);
    bot.sendMessage(
      msg.chat.id,
      "Заявка отменена. Чтобы начать заново — /new",
    );
  });

  bot.onText(/^\/new/, (msg) => {
    sessions.set(msg.chat.id, {
      step: "awaitingTitle",
      submittedBy: whoSubmitted(msg),
    });
    bot.sendMessage(
      msg.chat.id,
      "Шаг 1/4. Как называется мероприятие?\n\nНапишите коротко, например: \"Концерт к 9 мая\".",
    );
  });

  bot.on("message", async (msg) => {
    if (!msg.text || msg.text.startsWith("/")) return;
    const chatId = msg.chat.id;
    const session = sessions.get(chatId);
    if (!session) {
      bot.sendMessage(
        chatId,
        "Чтобы подать заявку, отправьте /new\nСправка: /help",
      );
      return;
    }

    const text = msg.text.trim();

    try {
      if (session.step === "awaitingTitle") {
        if (!text) {
          bot.sendMessage(chatId, "Название не может быть пустым. Попробуйте ещё раз.");
          return;
        }
        session.title = text;
        session.step = "awaitingDate";
        bot.sendMessage(
          chatId,
          "Шаг 2/4. Когда состоится мероприятие?\n\nФормат: ДД.ММ.ГГГГ ЧЧ:ММ (например: 09.05.2026 14:00)\nИли просто ДД.ММ если в этом году.\nЕсли точная дата неизвестна — напишите \"пропустить\".",
        );
        return;
      }

      if (session.step === "awaitingDate") {
        const parsed = parseDate(text);
        if (text && !/^(пропустить|skip|-)$/i.test(text) && parsed === null) {
          bot.sendMessage(
            chatId,
            "Не понял дату. Попробуйте формат ДД.ММ.ГГГГ ЧЧ:ММ (например, 09.05.2026 14:00) или напишите \"пропустить\".",
          );
          return;
        }
        session.eventDate = parsed;
        session.step = "awaitingLocation";
        bot.sendMessage(
          chatId,
          "Шаг 3/4. Где будет проходить?\n\nНапример: \"Актовый зал\", \"Спортзал\", \"Школьный двор\".\nЕсли неизвестно — напишите \"пропустить\".",
        );
        return;
      }

      if (session.step === "awaitingLocation") {
        session.location = emptyOrNull(text);
        session.step = "awaitingDescription";
        bot.sendMessage(
          chatId,
          "Шаг 4/4. Кратко опишите мероприятие — что снимать, кто участвует, особые пожелания.\nИли напишите \"пропустить\".",
        );
        return;
      }

      if (session.step === "awaitingDescription") {
        session.description = emptyOrNull(text);

        if (!session.title) {
          sessions.delete(chatId);
          bot.sendMessage(chatId, "Что-то пошло не так. Начните заново: /new");
          return;
        }

        const position = await nextPosition("new");
        const [created] = await db
          .insert(eventsTable)
          .values({
            title: session.title,
            description: session.description ?? null,
            eventDate: session.eventDate ?? null,
            location: session.location ?? null,
            submittedBy: session.submittedBy,
            status: "new",
            position,
          })
          .returning();

        sessions.delete(chatId);

        const dateStr = created.eventDate
          ? created.eventDate.toLocaleString("ru-RU", {
              day: "2-digit",
              month: "long",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "не указана";

        bot.sendMessage(
          chatId,
          `Готово! Заявка #${created.id} добавлена в медиа-доску.\n\n` +
            `Название: ${created.title}\n` +
            `Когда: ${dateStr}\n` +
            `Где: ${created.location ?? "не указано"}\n\n` +
            `Медиа-отдел увидит её в колонке «Новые». Чтобы подать ещё — /new`,
        );

        logger.info({ eventId: created.id, chatId }, "New event from Telegram");
        return;
      }
    } catch (err) {
      logger.error({ err }, "Telegram handler error");
      bot.sendMessage(
        chatId,
        "Произошла ошибка при сохранении. Попробуйте ещё раз: /new",
      );
      sessions.delete(chatId);
    }
  });

  logger.info("Telegram bot started (polling)");
}

import TelegramBot from "node-telegram-bot-api";
import type { Router } from "express";
import { db, eventsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "./logger";
import { broadcast } from "./ws";

// ─── Session types ─────────────────────────────────────────────────────────────

type SessionStep =
  | "awaitingTitle"
  | "awaitingDate"
  | "awaitingTime"
  | "awaitingLocation"
  | "awaitingDescription"
  | "awaitingContact";

interface Session {
  step: SessionStep;
  title?: string;
  dateOnly?: Date | null;
  eventDate?: Date | null;
  location?: string | null;
  description?: string | null;
  contactInfo?: string | null;
  submittedBy: string;
}

const sessions = new Map<number, Session>();

// ─── Constants ─────────────────────────────────────────────────────────────────

const SKIP_RE = /^(пропустить|пропуск|skip|нет|—|-|\.|\+)$/i;
const CANCEL_DATA = "cancel";
const SKIP_DATA = "skip";

const MONTHS_RU: Record<string, number> = {
  январь: 0, января: 0, янв: 0,
  февраль: 1, февраля: 1, фев: 1,
  март: 2, марта: 2, мар: 2,
  апрель: 3, апреля: 3, апр: 3,
  май: 4, мая: 4,
  июнь: 5, июня: 5, июн: 5,
  июль: 6, июля: 6, июл: 6,
  август: 7, августа: 7, авг: 7,
  сентябрь: 8, сентября: 8, сен: 8,
  октябрь: 9, октября: 9, окт: 9,
  ноябрь: 10, ноября: 10, ноя: 10,
  декабрь: 11, декабря: 11, дек: 11,
};

const WEEKDAYS_RU: Record<string, number> = {
  понедельник: 1, пн: 1,
  вторник: 2, вт: 2,
  среда: 3, среду: 3, ср: 3,
  четверг: 4, чт: 4,
  пятница: 5, пятницу: 5, пт: 5,
  суббота: 6, субботу: 6, сб: 6,
  воскресенье: 0, вс: 0, вск: 0,
};

// ─── Parsers ───────────────────────────────────────────────────────────────────

/** Parse a date-only string into a Date (time set to midnight). Returns null if not parseable. */
function parseDate(input: string): Date | null {
  const s = input.trim().toLowerCase();
  if (!s || SKIP_RE.test(s)) return null;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

  if (/^сегодня$/.test(s)) return today;
  if (/^завтра$/.test(s)) { const d = new Date(today); d.setDate(d.getDate() + 1); return d; }
  if (/^послезавтра$/.test(s)) { const d = new Date(today); d.setDate(d.getDate() + 2); return d; }

  const wdMatch = s.match(/^(?:в\s+)?(\S+)$/);
  if (wdMatch) {
    const wd = WEEKDAYS_RU[wdMatch[1]];
    if (wd !== undefined) {
      const d = new Date(today);
      const diff = ((wd - d.getDay()) + 7) % 7 || 7;
      d.setDate(d.getDate() + diff);
      return d;
    }
  }

  const numSep = s.match(/^(\d{1,2})[./\-](\d{1,2})(?:[./\-](\d{2,4}))?$/);
  if (numSep) {
    const [, dd, mm, yyyy] = numSep;
    let year = yyyy ? parseInt(yyyy, 10) : now.getFullYear();
    if (year < 100) year += 2000;
    const d = new Date(year, parseInt(mm, 10) - 1, parseInt(dd, 10), 0, 0, 0, 0);
    if (!isNaN(d.getTime())) return d;
  }

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const d = new Date(parseInt(iso[1]), parseInt(iso[2]) - 1, parseInt(iso[3]), 0, 0, 0, 0);
    if (!isNaN(d.getTime())) return d;
  }

  const ruDate = s.match(/^(\d{1,2})\s*([а-яё]+)\s*(\d{2,4})?$/);
  if (ruDate) {
    const [, dd, monthStr, yyyy] = ruDate;
    const monthIdx = MONTHS_RU[monthStr];
    if (monthIdx !== undefined) {
      let year = yyyy ? parseInt(yyyy, 10) : now.getFullYear();
      if (year < 100) year += 2000;
      const d = new Date(year, monthIdx, parseInt(dd, 10), 0, 0, 0, 0);
      if (!isNaN(d.getTime())) return d;
    }
  }

  // Fallback: JS Date constructor
  const fallback = new Date(s);
  if (!isNaN(fallback.getTime())) { fallback.setHours(0, 0, 0, 0); return fallback; }

  return null;
}

function parseTime(input: string): [number, number] | null {
  const s = input.trim().toLowerCase();
  if (!s || SKIP_RE.test(s)) return null;

  const m = s.match(/^(\d{1,2})[:.\- ](\d{2})$/);
  if (m) {
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) return [h, min];
  }

  const m4 = s.match(/^(\d{2})(\d{2})$/);
  if (m4) {
    const h = parseInt(m4[1], 10);
    const min = parseInt(m4[2], 10);
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) return [h, min];
  }

  const hOnly = s.match(/^(\d{1,2})\s*(?:ч(?:ас(?:ов)?)?|h(?:r)?)$/);
  if (hOnly) {
    const h = parseInt(hOnly[1], 10);
    if (h >= 0 && h <= 23) return [h, 0];
  }

  const plain = s.match(/^(\d{1,2})$/);
  if (plain) {
    const h = parseInt(plain[1], 10);
    if (h >= 0 && h <= 23) return [h, 0];
  }

  return null;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

function formatDateTime(d: Date): string {
  return d.toLocaleString("ru-RU", {
    day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function whoSubmitted(msg: TelegramBot.Message): string {
  const from = msg.from;
  if (!from) return "—";
  const name = [from.first_name, from.last_name].filter(Boolean).join(" ").trim();
  if (from.username) return name ? `${name} (@${from.username})` : `@${from.username}`;
  return name || `id:${from.id}`;
}

async function nextPosition(): Promise<number> {
  const [row] = await db
    .select({ max: sql<number>`COALESCE(MAX(${eventsTable.position}), -1)` })
    .from(eventsTable)
    .where(eq(eventsTable.status, "new"));
  return (row?.max ?? -1) + 1;
}

// ─── Keyboards ─────────────────────────────────────────────────────────────────

function mainMenuKeyboard(): TelegramBot.ReplyKeyboardMarkup {
  return {
    keyboard: [[{ text: "Подать заявку на съёмку" }]],
    resize_keyboard: true,
    one_time_keyboard: false,
  };
}

function skipCancelKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [[
      { text: "Пропустить", callback_data: SKIP_DATA },
      { text: "Отменить заявку", callback_data: CANCEL_DATA },
    ]],
  };
}

function cancelOnlyKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [[{ text: "Отменить заявку", callback_data: CANCEL_DATA }]],
  };
}

// ─── Bot factory ───────────────────────────────────────────────────────────────

function createBot(token: string): TelegramBot {
  // In production we use webhook mode (no polling), so Telegram pushes updates
  // to our HTTPS endpoint instead of us pulling them. This prevents the 409
  // Conflict that occurs when both the dev server AND the production deployment
  // try to long-poll the same token simultaneously.
  const isProduction = process.env.NODE_ENV === "production";

  const bot = new TelegramBot(token, {
    polling: isProduction
      ? false
      : { autoStart: true, interval: 300, params: { timeout: 10 } },
    webHook: isProduction ? { autoOpen: false } : false,
  });

  return bot;
}

// ─── Webhook registration (production only) ────────────────────────────────────

async function registerWebhook(bot: TelegramBot, token: string): Promise<void> {
  const domains = process.env.REPLIT_DOMAINS ?? "";
  const domain = domains.split(",")[0]?.trim();
  if (!domain) {
    logger.warn("REPLIT_DOMAINS not set — cannot register Telegram webhook, falling back to polling");
    await clearOtherPolling(token);
    // @ts-expect-error — setOptions is not in the type defs but exists at runtime
    bot.options.polling = { autoStart: true, interval: 300, params: { timeout: 10 } };
    bot.startPolling();
    return;
  }

  const webhookUrl = `https://${domain}/api/telegram-webhook`;
  try {
    await bot.setWebHook(webhookUrl);
    logger.info({ webhookUrl }, "Telegram webhook registered");
  } catch (err) {
    logger.error({ err }, "Failed to register Telegram webhook");
  }
}

async function clearOtherPolling(token: string): Promise<void> {
  try {
    const url = `https://api.telegram.org/bot${token}/deleteWebhook?drop_pending_updates=true`;
    await fetch(url);
    await new Promise((r) => setTimeout(r, 1500));
    logger.info("Telegram: cleared previous polling sessions");
  } catch (err) {
    logger.warn({ err }, "Telegram: could not clear previous polling");
  }
}

// ─── Main export ───────────────────────────────────────────────────────────────

/**
 * Initialise the Telegram bot.
 *
 * In **production** the bot receives updates via webhook (no polling).
 * Call `attachTelegramWebhook(router)` to mount the webhook endpoint.
 *
 * In **development** the bot uses long-polling after forcefully clearing any
 * stale session left by a previous run or the production instance.
 */
export async function startTelegramBot(webhookRouter: Router): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    logger.warn("TELEGRAM_BOT_TOKEN not set — Telegram bot disabled");
    return;
  }

  const isProduction = process.env.NODE_ENV === "production";
  const bot = createBot(token);

  if (isProduction) {
    await registerWebhook(bot, token);

    // Mount the webhook endpoint so Telegram can POST updates to us
    webhookRouter.post("/telegram-webhook", (req, res) => {
      try {
        bot.processUpdate(req.body as TelegramBot.Update);
        res.sendStatus(200);
      } catch (err) {
        logger.error({ err }, "Telegram webhook processing error");
        res.sendStatus(500);
      }
    });

    logger.info("Telegram bot started (webhook mode)");
  } else {
    // Development: kill any stale session first, then start polling
    await clearOtherPolling(token);
    logger.info("Telegram bot started (polling mode)");
  }

  // ── Register commands hint ────────────────────────────────────────────────
  bot.setMyCommands([
    { command: "new", description: "Подать заявку на съёмку" },
    { command: "cancel", description: "Отменить текущую заявку" },
    { command: "help", description: "Помощь" },
  ]).catch(() => {});

  // ── Graceful shutdown (polling only) ─────────────────────────────────────
  if (!isProduction) {
    const stop = () => { bot.stopPolling().catch(() => {}); };
    process.once("SIGTERM", stop);
    process.once("SIGINT", stop);
  }

  bot.on("polling_error", (err) => {
    if (String(err.message).includes("409")) {
      logger.warn("Telegram 409: another instance detected");
    } else {
      logger.error({ err: err.message }, "Telegram polling error");
    }
  });

  // ── /start ─────────────────────────────────────────────────────────────────
  bot.onText(/^\/start/, (msg) => {
    sessions.delete(msg.chat.id);
    bot.sendMessage(
      msg.chat.id,
      "Привет! Я бот медиа-отдела школы.\n\nНажмите кнопку ниже, чтобы подать заявку на съёмку мероприятия.",
      { reply_markup: mainMenuKeyboard() },
    );
  });

  bot.onText(/^\/help/, (msg) => {
    bot.sendMessage(
      msg.chat.id,
      "Нажмите кнопку «Подать заявку на съёмку» или введите /new.\n\n/cancel — отменить текущую заявку.",
      { reply_markup: mainMenuKeyboard() },
    );
  });

  bot.onText(/^\/cancel/, (msg) => {
    sessions.delete(msg.chat.id);
    bot.sendMessage(msg.chat.id, "Заявка отменена.", { reply_markup: mainMenuKeyboard() });
  });

  // ── Start new flow ─────────────────────────────────────────────────────────
  function startNewFlow(chatId: number, submittedBy: string): void {
    sessions.set(chatId, { step: "awaitingTitle", submittedBy });
    bot.sendMessage(
      chatId,
      "Шаг 1 из 6 — Название\n\nКак называется мероприятие?\nНапример: «Концерт ко Дню Победы»",
      { reply_markup: cancelOnlyKeyboard() },
    );
  }

  bot.onText(/^\/new/, (msg) => startNewFlow(msg.chat.id, whoSubmitted(msg)));

  // ── Callback queries (inline button taps) ─────────────────────────────────
  bot.on("callback_query", async (query) => {
    const chatId = query.message?.chat.id;
    if (!chatId) return;
    await bot.answerCallbackQuery(query.id).catch(() => {});

    if (query.data === CANCEL_DATA) {
      sessions.delete(chatId);
      bot.sendMessage(chatId, "Заявка отменена.", { reply_markup: mainMenuKeyboard() });
      return;
    }

    if (query.data === SKIP_DATA) {
      const session = sessions.get(chatId);
      if (!session) return;
      await handleStep(chatId, session, "пропустить");
    }
  });

  // ── Text messages ──────────────────────────────────────────────────────────
  bot.on("message", async (msg) => {
    if (!msg.text) return;
    const chatId = msg.chat.id;
    const text = msg.text.trim();

    // Reply-keyboard button
    if (text === "Подать заявку на съёмку") {
      startNewFlow(chatId, whoSubmitted(msg));
      return;
    }

    // Commands handled by onText above
    if (text.startsWith("/")) return;

    const session = sessions.get(chatId);
    if (!session) {
      bot.sendMessage(chatId, "Нажмите кнопку ниже, чтобы подать заявку.", {
        reply_markup: mainMenuKeyboard(),
      });
      return;
    }

    await handleStep(chatId, session, text);
  });

  // ── Step handler ───────────────────────────────────────────────────────────
  async function handleStep(chatId: number, session: Session, text: string): Promise<void> {
    try {
      switch (session.step) {

        case "awaitingTitle": {
          if (!text || SKIP_RE.test(text)) {
            bot.sendMessage(chatId, "Название не может быть пустым. Напишите название мероприятия.");
            return;
          }
          session.title = text;
          session.step = "awaitingDate";
          bot.sendMessage(
            chatId,
            "Шаг 2 из 6 — Дата\n\nКогда состоится мероприятие? Пишите как удобно:\n• 9 мая\n• 09.05.2026\n• завтра / послезавтра\n• в пятницу\n\nЕсли дата неизвестна — нажмите «Пропустить».",
            { reply_markup: skipCancelKeyboard() },
          );
          break;
        }

        case "awaitingDate": {
          if (SKIP_RE.test(text)) {
            session.dateOnly = null;
            session.eventDate = null;
            session.step = "awaitingLocation";
            bot.sendMessage(
              chatId,
              "Шаг 4 из 6 — Место\n\nГде будет проходить мероприятие?\nНапример: «Актовый зал», «Спортзал», «Школьный двор».\n\nЕсли неизвестно — нажмите «Пропустить».",
              { reply_markup: skipCancelKeyboard() },
            );
          } else {
            const d = parseDate(text);
            if (!d) {
              bot.sendMessage(
                chatId,
                "Не могу распознать дату. Попробуйте:\n• 9 мая\n• 09.05.2026\n• завтра\n• в пятницу\n\nИли нажмите «Пропустить».",
                { reply_markup: skipCancelKeyboard() },
              );
              return;
            }
            session.dateOnly = d;
            session.step = "awaitingTime";
            bot.sendMessage(
              chatId,
              `Дата: ${formatDate(d)}\n\nШаг 3 из 6 — Время\n\nВ какое время начнётся? Например: 14:00, 9:30, 15ч.\n\nЕсли время неизвестно — нажмите «Пропустить».`,
              { reply_markup: skipCancelKeyboard() },
            );
          }
          break;
        }

        case "awaitingTime": {
          if (SKIP_RE.test(text) || !session.dateOnly) {
            session.eventDate = session.dateOnly ?? null;
          } else {
            const t = parseTime(text);
            if (!t) {
              bot.sendMessage(
                chatId,
                "Не могу распознать время. Напишите в формате 14:00 или 9:30.\nИли нажмите «Пропустить».",
                { reply_markup: skipCancelKeyboard() },
              );
              return;
            }
            const d = new Date(session.dateOnly);
            d.setHours(t[0], t[1], 0, 0);
            session.eventDate = d;
          }
          session.step = "awaitingLocation";
          bot.sendMessage(
            chatId,
            "Шаг 4 из 6 — Место\n\nГде будет проходить мероприятие?\nНапример: «Актовый зал», «Спортзал», «Школьный двор».\n\nЕсли неизвестно — нажмите «Пропустить».",
            { reply_markup: skipCancelKeyboard() },
          );
          break;
        }

        case "awaitingLocation": {
          session.location = SKIP_RE.test(text) ? null : (text || null);
          session.step = "awaitingDescription";
          bot.sendMessage(
            chatId,
            "Шаг 5 из 6 — Описание\n\nОпишите мероприятие: что снимать, кто участвует, особые пожелания.\n\nЕсли нечего добавить — нажмите «Пропустить».",
            { reply_markup: skipCancelKeyboard() },
          );
          break;
        }

        case "awaitingDescription": {
          session.description = SKIP_RE.test(text) ? null : (text || null);
          session.step = "awaitingContact";
          bot.sendMessage(
            chatId,
            "Шаг 6 из 6 — Контакт\n\nОт кого эта заявка? Напишите ваше имя и как с вами связаться.\n\nНапример: «Анна Петровна, учитель музыки, +7 999 123-45-67»",
            { reply_markup: cancelOnlyKeyboard() },
          );
          break;
        }

        case "awaitingContact": {
          if (!text || SKIP_RE.test(text) || text.length < 2) {
            bot.sendMessage(
              chatId,
              "Пожалуйста, напишите ваше имя и контакт — медиа-отдел сможет уточнить детали.",
              { reply_markup: cancelOnlyKeyboard() },
            );
            return;
          }
          session.contactInfo = text;

          const position = await nextPosition();
          const [created] = await db
            .insert(eventsTable)
            .values({
              title: session.title!,
              description: session.description ?? null,
              eventDate: session.eventDate ?? null,
              location: session.location ?? null,
              submittedBy: session.submittedBy,
              contactInfo: session.contactInfo,
              status: "new",
              position,
            })
            .returning();

          sessions.delete(chatId);

          broadcast({
            type: "event_created",
            eventId: created.id,
            title: created.title,
            submittedBy: created.contactInfo ?? created.submittedBy,
          });

          const dateStr = created.eventDate ? formatDateTime(created.eventDate) : "не указана";

          bot.sendMessage(
            chatId,
            `Заявка принята!\n\n` +
              `Мероприятие: ${created.title}\n` +
              `Когда: ${dateStr}\n` +
              `Где: ${created.location ?? "не указано"}\n` +
              `От: ${created.contactInfo}\n\n` +
              `Медиа-отдел увидит её в колонке «Новые» прямо сейчас.`,
            { reply_markup: mainMenuKeyboard() },
          );

          logger.info({ eventId: created.id, chatId }, "New event from Telegram");
          break;
        }
      }
    } catch (err) {
      logger.error({ err }, "Telegram handler error");
      sessions.delete(chatId);
      bot.sendMessage(chatId, "Произошла ошибка. Попробуйте ещё раз.", {
        reply_markup: mainMenuKeyboard(),
      });
    }
  }
}

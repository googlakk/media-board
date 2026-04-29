# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Project: Медиа-доска (School Media Department)

Internal admin tool for a school's media crew to manage event filming requests.

### Architecture

- `artifacts/media-board` — React + Vite frontend at `/`
  - Kanban board (`/`) with drag-and-drop between status columns (Новые, В работе, Снято, Опубликовано) using `@dnd-kit`
  - Schedule view (`/schedule`) — upcoming events for next 14 days
  - Click-to-edit dialog, manual create/delete, header dashboard stats
- `artifacts/api-server` — Express API at `/api`
  - REST CRUD + reorder/move endpoint at `/api/events/*`
  - Telegram bot (long-polling, `node-telegram-bot-api`) initialized in `src/lib/telegram-bot.ts`
    - Conversational `/new` flow → creates event with status `new`
    - Stateless across restarts (in-memory session map)
    - Uses `TELEGRAM_BOT_TOKEN` secret
- `lib/db` — Drizzle schema; `events` table with `eventStatusEnum`, `position` for kanban ordering
- `lib/api-spec` — OpenAPI source of truth at `openapi.yaml`; codegen produces `lib/api-zod` and `lib/api-client-react`

### Codegen pitfall

Schema names in `openapi.yaml` for request bodies must use `*Input` (not `*Body`) to avoid orval zod/types collisions with operation-derived consts.

### Telegram bot

Polling starts after the HTTP server in `artifacts/api-server/src/index.ts`. To redeploy, just restart the api-server workflow. Old polling sessions exit cleanly.

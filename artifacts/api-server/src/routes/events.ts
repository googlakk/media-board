import { Router, type IRouter } from "express";
import { eq, sql, asc, and, gte, lte, lt } from "drizzle-orm";
import { db, eventsTable, type EventRow } from "@workspace/db";
import {
  CreateEventBody,
  UpdateEventBody,
  GetEventParams,
  UpdateEventParams,
  DeleteEventParams,
  MoveEventParams,
  MoveEventBody,
  GetEventResponse,
  ListEventsResponse,
  MoveEventResponse,
  GetEventStatsResponse,
  GetUpcomingEventsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

const STATUSES = ["new", "in_progress", "shot", "published"] as const;

async function nextPositionForStatus(
  status: EventRow["status"],
): Promise<number> {
  const [row] = await db
    .select({
      max: sql<number>`COALESCE(MAX(${eventsTable.position}), -1)`,
    })
    .from(eventsTable)
    .where(eq(eventsTable.status, status));
  return (row?.max ?? -1) + 1;
}

async function listAllOrdered(): Promise<EventRow[]> {
  return db
    .select()
    .from(eventsTable)
    .orderBy(asc(eventsTable.status), asc(eventsTable.position), asc(eventsTable.id));
}

router.get("/events", async (_req, res): Promise<void> => {
  const rows = await listAllOrdered();
  res.json(ListEventsResponse.parse(rows));
});

router.get("/events/stats", async (_req, res): Promise<void> => {
  const now = new Date();
  const in14 = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const [totalRow] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(eventsTable);

  const byStatusRows = await db
    .select({
      status: eventsTable.status,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(eventsTable)
    .groupBy(eventsTable.status);

  const byStatus = STATUSES.map((status) => ({
    status,
    count: byStatusRows.find((r) => r.status === status)?.count ?? 0,
  }));

  const [upcomingRow] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(eventsTable)
    .where(
      and(
        gte(eventsTable.eventDate, now),
        lte(eventsTable.eventDate, in14),
      ),
    );

  const [overdueRow] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(eventsTable)
    .where(
      and(
        lt(eventsTable.eventDate, now),
        sql`${eventsTable.status} IN ('new', 'in_progress')`,
      ),
    );

  res.json(
    GetEventStatsResponse.parse({
      total: totalRow?.count ?? 0,
      byStatus,
      upcomingCount: upcomingRow?.count ?? 0,
      overdueCount: overdueRow?.count ?? 0,
    }),
  );
});

router.get("/events/upcoming", async (_req, res): Promise<void> => {
  const now = new Date();
  const in14 = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select()
    .from(eventsTable)
    .where(
      and(
        gte(eventsTable.eventDate, now),
        lte(eventsTable.eventDate, in14),
      ),
    )
    .orderBy(asc(eventsTable.eventDate));
  res.json(GetUpcomingEventsResponse.parse(rows));
});

router.post("/events", async (req, res): Promise<void> => {
  const parsed = CreateEventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const status = parsed.data.status ?? "new";
  const position = await nextPositionForStatus(status);
  const [row] = await db
    .insert(eventsTable)
    .values({
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      eventDate: parsed.data.eventDate ?? null,
      location: parsed.data.location ?? null,
      submittedBy: parsed.data.submittedBy ?? null,
      assignee: parsed.data.assignee ?? null,
      notes: parsed.data.notes ?? null,
      status,
      position,
    })
    .returning();
  res.status(201).json(GetEventResponse.parse(row));
});

router.get("/events/:id", async (req, res): Promise<void> => {
  const params = GetEventParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .select()
    .from(eventsTable)
    .where(eq(eventsTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Event not found" });
    return;
  }
  res.json(GetEventResponse.parse(row));
});

router.patch("/events/:id", async (req, res): Promise<void> => {
  const params = UpdateEventParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateEventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Partial<typeof eventsTable.$inferInsert> = {};
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.description !== undefined)
    updates.description = parsed.data.description ?? null;
  if (parsed.data.eventDate !== undefined)
    updates.eventDate = parsed.data.eventDate ?? null;
  if (parsed.data.location !== undefined)
    updates.location = parsed.data.location ?? null;
  if (parsed.data.assignee !== undefined)
    updates.assignee = parsed.data.assignee ?? null;
  if (parsed.data.notes !== undefined)
    updates.notes = parsed.data.notes ?? null;

  // If status is changing, also re-position to end of new column
  if (parsed.data.status !== undefined) {
    updates.status = parsed.data.status;
    updates.position = await nextPositionForStatus(parsed.data.status);
  }

  if (Object.keys(updates).length === 0) {
    const [existing] = await db
      .select()
      .from(eventsTable)
      .where(eq(eventsTable.id, params.data.id));
    if (!existing) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    res.json(GetEventResponse.parse(existing));
    return;
  }

  const [row] = await db
    .update(eventsTable)
    .set(updates)
    .where(eq(eventsTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Event not found" });
    return;
  }
  res.json(GetEventResponse.parse(row));
});

router.delete("/events/:id", async (req, res): Promise<void> => {
  const params = DeleteEventParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .delete(eventsTable)
    .where(eq(eventsTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Event not found" });
    return;
  }
  res.sendStatus(204);
});

router.post("/events/:id/move", async (req, res): Promise<void> => {
  const params = MoveEventParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = MoveEventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { status: newStatus, position: newPosition } = parsed.data;

  await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(eventsTable)
      .where(eq(eventsTable.id, params.data.id));
    if (!current) {
      throw new Error("Event not found");
    }

    if (current.status === newStatus) {
      // Reorder within the same column
      const items = await tx
        .select()
        .from(eventsTable)
        .where(eq(eventsTable.status, newStatus))
        .orderBy(asc(eventsTable.position), asc(eventsTable.id));
      const without = items.filter((i) => i.id !== current.id);
      const clamped = Math.max(0, Math.min(newPosition, without.length));
      without.splice(clamped, 0, current);
      for (let i = 0; i < without.length; i++) {
        await tx
          .update(eventsTable)
          .set({ position: i })
          .where(eq(eventsTable.id, without[i].id));
      }
    } else {
      // Moving across columns
      // 1. Resequence source column (without the moving item)
      const sourceItems = await tx
        .select()
        .from(eventsTable)
        .where(eq(eventsTable.status, current.status))
        .orderBy(asc(eventsTable.position), asc(eventsTable.id));
      const sourceWithout = sourceItems.filter((i) => i.id !== current.id);
      for (let i = 0; i < sourceWithout.length; i++) {
        await tx
          .update(eventsTable)
          .set({ position: i })
          .where(eq(eventsTable.id, sourceWithout[i].id));
      }

      // 2. Insert into target column at newPosition
      const targetItems = await tx
        .select()
        .from(eventsTable)
        .where(eq(eventsTable.status, newStatus))
        .orderBy(asc(eventsTable.position), asc(eventsTable.id));
      const clamped = Math.max(0, Math.min(newPosition, targetItems.length));
      targetItems.splice(clamped, 0, { ...current, status: newStatus });
      for (let i = 0; i < targetItems.length; i++) {
        await tx
          .update(eventsTable)
          .set({
            position: i,
            ...(targetItems[i].id === current.id ? { status: newStatus } : {}),
          })
          .where(eq(eventsTable.id, targetItems[i].id));
      }
    }
  });

  const rows = await listAllOrdered();
  res.json(MoveEventResponse.parse(rows));
});

export default router;

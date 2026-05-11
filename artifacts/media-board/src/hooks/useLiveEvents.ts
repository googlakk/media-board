import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListEventsQueryKey,
  getGetEventStatsQueryKey,
  getGetUpcomingEventsQueryKey,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

type LiveMessage =
  | { type: "hello" }
  | { type: "event_created"; eventId: number; title: string; submittedBy: string | null }
  | { type: "event_updated"; eventId: number }
  | { type: "event_moved"; eventId: number }
  | { type: "event_deleted"; eventId: number };

function buildWsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/api/live`;
}

export function useLiveEvents(): void {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Stable refs so the effect never re-runs due to reference changes
  const queryClientRef = useRef(queryClient);
  const toastRef = useRef(toast);
  queryClientRef.current = queryClient;
  toastRef.current = toast;

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let destroyed = false;

    const invalidateAll = () => {
      queryClientRef.current.invalidateQueries({ queryKey: getListEventsQueryKey() });
      queryClientRef.current.invalidateQueries({ queryKey: getGetEventStatsQueryKey() });
      queryClientRef.current.invalidateQueries({ queryKey: getGetUpcomingEventsQueryKey() });
    };

    const scheduleReconnect = (delayMs = 2000) => {
      if (destroyed || reconnectTimer !== null) return;
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, delayMs);
    };

    const connect = () => {
      if (destroyed) return;

      try {
        ws = new WebSocket(buildWsUrl());
      } catch {
        scheduleReconnect(3000);
        return;
      }

      ws.addEventListener("open", () => {
        // Connection established — nothing to do, server sends "hello"
      });

      ws.addEventListener("message", (ev) => {
        let msg: LiveMessage;
        try {
          msg = JSON.parse(ev.data as string) as LiveMessage;
        } catch {
          return;
        }

        if (msg.type === "hello") return;

        // Always refresh data on any event
        invalidateAll();

        if (msg.type === "event_created") {
          toastRef.current({
            title: "Новая заявка",
            description: msg.submittedBy
              ? `«${msg.title}» — от ${msg.submittedBy}`
              : `«${msg.title}»`,
          });
        }
      });

      ws.addEventListener("close", (ev) => {
        ws = null;
        // Reconnect unless intentionally destroyed
        if (!destroyed) {
          // Back off a bit on repeated failures
          const delay = ev.wasClean ? 1500 : 3000;
          scheduleReconnect(delay);
        }
      });

      ws.addEventListener("error", () => {
        // The "close" event fires right after, so just close to trigger reconnect
        try { ws?.close(); } catch { /* ignore */ }
      });
    };

    connect();

    return () => {
      destroyed = true;
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      try { ws?.close(); } catch { /* ignore */ }
      ws = null;
    };
  }, []); // empty deps — uses refs for queryClient and toast
}

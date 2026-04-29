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
  | {
      type: "event_created";
      eventId: number;
      title: string;
      submittedBy: string | null;
    }
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
  const reconnectTimer = useRef<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    const invalidateAll = () => {
      queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetEventStatsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetUpcomingEventsQueryKey() });
    };

    const connect = () => {
      if (!isMountedRef.current) return;
      let ws: WebSocket;
      try {
        ws = new WebSocket(buildWsUrl());
      } catch {
        scheduleReconnect();
        return;
      }
      wsRef.current = ws;

      ws.addEventListener("message", (ev) => {
        let msg: LiveMessage;
        try {
          msg = JSON.parse(ev.data) as LiveMessage;
        } catch {
          return;
        }

        if (msg.type === "hello") return;

        invalidateAll();

        if (msg.type === "event_created") {
          toast({
            title: "Новая заявка",
            description: msg.submittedBy
              ? `${msg.title} — от ${msg.submittedBy}`
              : msg.title,
          });
        }
      });

      ws.addEventListener("close", () => {
        scheduleReconnect();
      });

      ws.addEventListener("error", () => {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      });
    };

    const scheduleReconnect = () => {
      if (!isMountedRef.current) return;
      if (reconnectTimer.current !== null) return;
      reconnectTimer.current = window.setTimeout(() => {
        reconnectTimer.current = null;
        connect();
      }, 2000);
    };

    connect();

    return () => {
      isMountedRef.current = false;
      if (reconnectTimer.current !== null) {
        window.clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          /* ignore */
        }
        wsRef.current = null;
      }
    };
  }, [queryClient, toast]);
}

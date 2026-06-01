"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { supabaseClient } from "@/app/lib/supabase/client";

type Props = {
  fallbackIntervalMs?: number;
  tenantId?: string | null;
  tableId?: string | null;
  tableToken?: string | null;
};

const REFRESH_EVENTS = ["menu_updated", "table_updated", "tables_updated"] as const;

export default function MenuRealtimeRefresh({ fallbackIntervalMs = 60000, tenantId, tableId, tableToken }: Props) {
  const router = useRouter();
  const pendingRefresh = useRef(false);
  const lastRefreshAt = useRef(0);

  useEffect(() => {
    const channelNames = Array.from(
      new Set(
        [
          tenantId ? `public-menu:${tenantId}` : null,
          tableId ? `public-table:${tableId}` : null,
          tableToken ? `public-table:${tableToken}` : null,
        ].filter((channelName): channelName is string => Boolean(channelName))
      )
    );

    if (channelNames.length === 0) return;

    const refreshMenu = () => {
      if (typeof document !== "undefined" && document.hidden) {
        pendingRefresh.current = true;
        return;
      }

      const now = Date.now();
      if (now - lastRefreshAt.current < 500) return;
      lastRefreshAt.current = now;

      router.refresh();
    };

    const channels = channelNames.map((channelName) => {
      let channel = supabaseClient.channel(channelName);

      for (const event of REFRESH_EVENTS) {
        channel = channel.on("broadcast", { event }, refreshMenu);
      }

      return channel.subscribe((status, error) => {
        if (process.env.NODE_ENV === "development") {
          console.info("[menu-realtime]", channelName, status, error ?? "");
        }
      });
    });

    const handleVisibilityChange = () => {
      if (!document.hidden && pendingRefresh.current) {
        pendingRefresh.current = false;
        lastRefreshAt.current = Date.now();
        router.refresh();
      }
    };

    const fallbackId =
      fallbackIntervalMs > 0
        ? setInterval(() => {
            if (typeof document !== "undefined" && document.hidden) return;
            lastRefreshAt.current = Date.now();
            router.refresh();
          }, fallbackIntervalMs)
        : null;

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (fallbackId) clearInterval(fallbackId);
      for (const channel of channels) {
        supabaseClient.removeChannel(channel);
      }
    };
  }, [fallbackIntervalMs, router, tableId, tableToken, tenantId]);

  return null;
}


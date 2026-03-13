"use client";

import { useEffect } from "react";

const LAST_SEEN_KEY = "last_seen";
const STALE_TAB_THRESHOLD_MS = 7_200_000;

export function AutoRefreshHandler() {
  useEffect(() => {
    const updateLastSeen = () => {
      localStorage.setItem(LAST_SEEN_KEY, String(Date.now()));
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        updateLastSeen();
        return;
      }

      if (document.visibilityState !== "visible") {
        return;
      }

      const lastSeenValue = localStorage.getItem(LAST_SEEN_KEY);
      const lastSeen = lastSeenValue ? Number(lastSeenValue) : null;
      const now = Date.now();

      if (lastSeen !== null && Number.isFinite(lastSeen)) {
        if (now - lastSeen > STALE_TAB_THRESHOLD_MS) {
          window.location.reload();
          return;
        }
      }

      localStorage.setItem(LAST_SEEN_KEY, String(now));
    };

    handleVisibilityChange();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return null;
}

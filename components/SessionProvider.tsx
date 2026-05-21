// Top-level provider that hydrates the session store from IndexedDB on mount
// and runs a periodic check to purge expired sessions while the app is open.
// PR 6 mounts this in the root layout.

"use client";

import { useEffect } from "react";
import { useSessionStore } from "@/lib/store/session";

const PURGE_INTERVAL_MS = 60_000;

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const hydrateFromStorage = useSessionStore((s) => s.hydrateFromStorage);
  const expiresAt = useSessionStore((s) => s.expiresAt);
  const reset = useSessionStore((s) => s.reset);

  useEffect(() => {
    hydrateFromStorage();
  }, [hydrateFromStorage]);

  useEffect(() => {
    if (!expiresAt) return;

    const interval = setInterval(() => {
      if (Date.now() >= expiresAt) {
        reset();
      }
    }, PURGE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [expiresAt, reset]);

  return <>{children}</>;
}

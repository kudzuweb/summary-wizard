// Displays remaining time before the session auto-deletes.
// Subscribes to a minute-tick external store to stay lint-clean.

"use client";

import { useSyncExternalStore, useCallback } from "react";
import styles from "./TtlCountdown.module.css";

interface TtlCountdownProps {
  expiresAt: number;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return "less than a minute";
  const hours = Math.floor(ms / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function subscribeToMinuteTick(callback: () => void) {
  const interval = setInterval(callback, 60_000);
  return () => clearInterval(interval);
}

export function TtlCountdown({ expiresAt }: TtlCountdownProps) {
  const getSnapshot = useCallback(() => {
    const ms = expiresAt - Date.now();
    return Math.max(0, Math.floor(ms / 60_000));
  }, [expiresAt]);

  const remainingMinutes = useSyncExternalStore(
    subscribeToMinuteTick,
    getSnapshot,
    getSnapshot,
  );

  if (remainingMinutes <= 0) return null;

  const ms = remainingMinutes * 60_000;
  return (
    <p className={styles.countdown}>
      This record will be deleted in {formatRemaining(ms)}
    </p>
  );
}

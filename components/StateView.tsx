// Shared state-display component for recurring loading, error, empty, and
// expired states. Consumed by the shell, summary panel, and chat to avoid
// duplicating UI for these common patterns.

"use client";

import styles from "./StateView.module.css";

interface StateViewProps {
  state: "loading" | "error" | "empty" | "expired";
  message?: string;
  onRetry?: () => void;
  onStartOver?: () => void;
}

export function StateView({ state, message, onRetry, onStartOver }: StateViewProps) {
  if (state === "loading") {
    return (
      <div className={styles.container}>
        <div className={styles.spinner} aria-label="Loading" />
        <p className={styles.message}>{message ?? "Processing your record…"}</p>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className={styles.container}>
        <div className={styles.iconCircle} data-variant="error">!</div>
        <p className={styles.message}>{message ?? "Something went wrong."}</p>
        {onRetry && (
          <button className={styles.action} onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
    );
  }

  if (state === "expired") {
    return (
      <div className={styles.container}>
        <div className={styles.iconCircle} data-variant="expired">&times;</div>
        <p className={styles.heading}>This record has been deleted</p>
        <p className={styles.message}>
          For your privacy, uploaded records are automatically removed after 8 hours.
        </p>
        {onStartOver && (
          <button className={styles.action} onClick={onStartOver}>
            Upload a new record
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <p className={styles.message}>{message ?? "No record loaded."}</p>
    </div>
  );
}

// App shell: switches on session status to show upload, main app, or state
// views. Later PRs fill the summary, timeline, and chat placeholders.

"use client";

import { useCallback } from "react";
import { useSessionStore } from "@/lib/store/session";
import { StateView } from "@/components/StateView";
import { FileUpload } from "@/components/FileUpload";
import { TtlCountdown } from "@/components/TtlCountdown";
import { SummaryPanel } from "@/components/SummaryPanel";
import { Timeline } from "@/components/Timeline";
import type { Bundle } from "@/types/fhir";
import styles from "./page.module.css";

export default function Home() {
  const status = useSessionStore((s) => s.status);
  const error = useSessionStore((s) => s.error);
  const expiresAt = useSessionStore((s) => s.expiresAt);
  const ingestFromBundle = useSessionStore((s) => s.ingestFromBundle);
  const setStatus = useSessionStore((s) => s.setStatus);
  const setError = useSessionStore((s) => s.setError);
  const reset = useSessionStore((s) => s.reset);

  const handleUpload = useCallback(
    async (file: File) => {
      setStatus("loading");

      const formData = new FormData();
      formData.append("file", file);

      try {
        const response = await fetch("/api/ingest", { method: "POST", body: formData });
        const data = await response.json();

        if (!response.ok || "error" in data) {
          setError(data.error ?? "Upload failed");
          return;
        }

        await ingestFromBundle(data as Bundle);
      } catch {
        setError("Network error — please check your connection and try again.");
      }
    },
    [setStatus, setError, ingestFromBundle],
  );

  if (status === "loading") {
    return (
      <div className={styles.page}>
        <StateView state="loading" />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className={styles.page}>
        <StateView
          state="error"
          message={error}
          onRetry={() => setStatus("empty")}
        />
      </div>
    );
  }

  if (status === "expired") {
    return (
      <div className={styles.page}>
        <StateView state="expired" onStartOver={reset} />
      </div>
    );
  }

  if (status === "ready") {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.titleSmall}>
            <span className={styles.accent}>Summary</span> Wizard
          </h1>
          <button className={styles.clearButton} onClick={reset}>
            Clear &amp; start over
          </button>
        </header>

        <main className={styles.mainGrid}>
          <section className={styles.panel} data-region="summary">
            <h2 className={styles.panelTitle}>Summary</h2>
            <SummaryPanel />
          </section>

          <section className={styles.panel} data-region="timeline">
            <h2 className={styles.panelTitle}>Timeline</h2>
            <Timeline />
          </section>

          {/* PR 12: Chat */}
          <section className={styles.panel} data-region="chat">
            <h2 className={styles.panelTitle}>Ask a question</h2>
            <p className={styles.placeholder}>Chat panel will render here.</p>
          </section>
        </main>

        {expiresAt && <TtlCountdown expiresAt={expiresAt} />}
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>
        <span className={styles.accent}>Summary</span> Wizard
      </h1>
      <p className={styles.subtitle}>
        Upload a medical record to generate a clinician-facing summary,
        interactive health-history timeline, and AI-powered Q&A.
      </p>
      <FileUpload onSubmit={handleUpload} />
    </div>
  );
}

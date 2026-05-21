// Renders the IPS summary as collapsible section cards in a fixed clinical
// order. Fetches the summary once when a bundle is ready and caches it in
// the session store.

"use client";

import { useEffect, useRef, useState } from "react";
import { useSessionStore } from "@/lib/store/session";
import { StateView } from "@/components/StateView";
import type { SummarySection } from "@/types/summary";
import styles from "./SummaryPanel.module.css";

const SECTION_ORDER = [
  "Problem List",
  "Medication List",
  "Allergies and Intolerances",
  "History of Procedures",
  "Immunizations",
  "Vital Signs",
];

function sectionSortKey(title: string): number {
  const normalized = title.toLowerCase();
  const index = SECTION_ORDER.findIndex((s) => normalized.includes(s.toLowerCase()));
  return index >= 0 ? index : SECTION_ORDER.length;
}

function sortSections(sections: SummarySection[]): SummarySection[] {
  return [...sections].sort((a, b) => sectionSortKey(a.title) - sectionSortKey(b.title));
}

function isAllergySection(title: string): boolean {
  return title.toLowerCase().includes("allerg");
}

function SectionCard({ section }: { section: SummarySection }) {
  const [open, setOpen] = useState(true);
  const isAllergy = isAllergySection(section.title);

  return (
    <details
      className={`${styles.card} ${isAllergy ? styles.allergyCard : ""}`}
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className={styles.cardHeader}>
        <span className={styles.cardTitle}>{section.title}</span>
        {isAllergy && <span className={styles.allergyBadge}>Safety-critical</span>}
      </summary>
      <div className={styles.cardBody}>
        {section.content.split("\n").map((line, i) => (
          <p key={i} className={styles.line}>
            {line}
          </p>
        ))}
      </div>
    </details>
  );
}

export function SummaryPanel() {
  const bundle = useSessionStore((s) => s.bundle);
  const summary = useSessionStore((s) => s.summary);
  const setSummary = useSessionStore((s) => s.setSummary);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!bundle || summary || fetchedRef.current) return;
    fetchedRef.current = true;

    setLoading(true);
    fetch("/api/summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bundle }),
    })
      .then((res) => res.json())
      .then((data) => {
        if ("error" in data) {
          setError(data.error);
        } else {
          setSummary(data.sections);
        }
      })
      .catch(() => setError("Failed to generate summary."))
      .finally(() => setLoading(false));
  }, [bundle, summary, setSummary]);

  if (loading) {
    return <StateView state="loading" message="Generating summary…" />;
  }

  if (error) {
    return (
      <StateView
        state="error"
        message={error}
        onRetry={() => {
          setError(null);
          fetchedRef.current = false;
        }}
      />
    );
  }

  if (!summary) {
    return <StateView state="empty" message="No summary available." />;
  }

  const sorted = sortSections(summary);

  return (
    <div className={styles.panel}>
      {sorted.map((section) => (
        <SectionCard key={section.title} section={section} />
      ))}
    </div>
  );
}

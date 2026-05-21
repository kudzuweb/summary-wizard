// Chronological event strip of medical record highlights. Evenly-spaced
// vertical bars rendered via DOM in a useEffect; hover expands in-place
// via CSS transitions on the created elements.

"use client";

import { useRef, useEffect, useMemo } from "react";
import { useSessionStore } from "@/lib/store/session";
import { bundleToEvents } from "@/lib/timeline/transform";
import { fuzzyToTimestamp } from "@/lib/timeline/dates";
import type { TimelineEvent, Lane } from "@/types/timeline";
import styles from "./Timeline.module.css";

const LANE_COLORS: Record<Lane, string> = {
  Visits: "var(--lane-visits)",
  Problems: "var(--lane-problems)",
  Medications: "var(--lane-medications)",
  Procedures: "var(--lane-procedures)",
  Labs: "var(--lane-labs)",
  Immunizations: "var(--lane-immunizations)",
};

function eventLabel(event: TimelineEvent): string {
  const name = event.label;
  switch (event.sourceType) {
    case "Condition":
      return `${name} diagnosis`;
    case "MedicationRequest":
    case "MedicationStatement":
      return `${name} start`;
    default:
      return name;
  }
}

function eventDetail(event: TimelineEvent): string {
  const parts: string[] = [];
  if (event.status && event.status !== "unknown") parts.push(event.status);
  const d = event.detail;
  if (d.dosage) parts.push(d.dosage as string);
  if (d.value != null && d.unit) parts.push(`${d.value} ${d.unit}`);
  if (d.interpretation) parts.push(`(${d.interpretation})`);
  return parts.join(" · ");
}

function formatDate(iso: string, precision: string): string {
  const d = new Date(iso);
  if (precision === "year") return d.getUTCFullYear().toString();
  if (precision === "month")
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", timeZone: "UTC" });
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

function render(container: HTMLDivElement, events: TimelineEvent[]) {
  container.replaceChildren();

  if (events.length === 0) {
    const p = document.createElement("p");
    p.className = styles.empty;
    p.textContent = "No timeline events to display.";
    container.appendChild(p);
    return;
  }

  const strip = document.createElement("div");
  strip.className = styles.strip;

  for (const event of events) {
    const color = LANE_COLORS[event.lane];
    const barHeight = 20 + event.salience * 30;
    const opacity = 0.4 + event.salience * 0.6;

    const el = document.createElement("div");
    el.className = styles.event;
    el.dataset.lane = event.lane;

    const bar = document.createElement("div");
    bar.className = styles.bar;
    bar.style.height = `${barHeight}px`;
    bar.style.backgroundColor = color;
    bar.style.opacity = String(opacity);
    el.appendChild(bar);

    const labelGroup = document.createElement("div");
    labelGroup.className = styles.labelGroup;

    const label = document.createElement("span");
    label.className = styles.label;
    label.textContent = eventLabel(event);
    labelGroup.appendChild(label);

    const date = document.createElement("span");
    date.className = styles.date;
    date.textContent = formatDate(event.start.iso, event.start.precision);
    labelGroup.appendChild(date);

    const detail = eventDetail(event);
    if (detail) {
      const detailEl = document.createElement("span");
      detailEl.className = styles.detail;
      detailEl.textContent = detail;
      labelGroup.appendChild(detailEl);
    }

    el.appendChild(labelGroup);
    strip.appendChild(el);
  }

  container.appendChild(strip);
}

export function Timeline() {
  const containerRef = useRef<HTMLDivElement>(null);
  const bundle = useSessionStore((s) => s.bundle);

  const events = useMemo(() => {
    if (!bundle) return [];
    return bundleToEvents(bundle)
      .filter((e) => e.sourceType !== "Encounter")
      .sort((a, b) => fuzzyToTimestamp(a.start) - fuzzyToTimestamp(b.start));
  }, [bundle]);

  useEffect(() => {
    if (!containerRef.current) return;
    render(containerRef.current, events);
  }, [events]);

  return <div ref={containerRef} className={styles.container} />;
}

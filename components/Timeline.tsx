// Alternating timeline: events branch above and below a horizontal axis,
// positioned proportionally to time. The timeline scales wider when events
// cluster, keeping a minimum gap so labels stay readable. Calendar-aware
// year and month ticks orient the reader along the axis.

"use client";

import { useRef, useEffect, useMemo } from "react";
import { useSessionStore } from "@/lib/store/session";
import { bundleToEvents } from "@/lib/timeline/transform";
import { fuzzyToTimestamp } from "@/lib/timeline/dates";
import type { TimelineEvent, Lane } from "@/types/timeline";
import styles from "./Timeline.module.css";

const LANE_ORDER: Lane[] = ["Visits", "Problems", "Medications", "Procedures", "Labs", "Immunizations"];

const LANE_COLORS: Record<Lane, string> = {
  Visits: "var(--lane-visits)",
  Problems: "var(--lane-problems)",
  Medications: "var(--lane-medications)",
  Procedures: "var(--lane-procedures)",
  Labs: "var(--lane-labs)",
  Immunizations: "var(--lane-immunizations)",
};

const PADDING = 40;
const MIN_GAP = 60;

function eventLabel(event: TimelineEvent): string {
  switch (event.sourceType) {
    case "Condition":
      return `${event.label} diagnosis`;
    case "MedicationRequest":
    case "MedicationStatement":
      return `${event.label} start`;
    default:
      return event.label;
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

type Tick = { time: number; label: string; minor: boolean };

function generateTicks(minTime: number, maxTime: number, timeRange: number): Tick[] {
  if (timeRange === 0) {
    const label = new Date(minTime).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      timeZone: "UTC",
    });
    return [{ time: minTime, label, minor: false }];
  }

  const ticks: Tick[] = [];
  const rangeInDays = timeRange / 86_400_000;
  const startYear = new Date(minTime).getUTCFullYear();
  const endYear = new Date(maxTime).getUTCFullYear();

  for (let y = startYear; y <= endYear; y++) {
    const t = new Date(Date.UTC(y, 0, 1)).getTime();
    const clamped = Math.max(t, minTime);
    if (clamped <= maxTime) {
      ticks.push({ time: clamped, label: String(y), minor: false });
    }
  }

  if (rangeInDays <= 365 * 3) {
    const startMonth = new Date(minTime).getUTCMonth();
    let y = startYear;
    let m = startMonth;
    for (;;) {
      const t = new Date(Date.UTC(y, m, 1)).getTime();
      if (t > maxTime) break;
      if (t >= minTime && m !== 0) {
        const label = new Date(t).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
        ticks.push({ time: t, label, minor: true });
      }
      m++;
      if (m > 11) {
        m = 0;
        y++;
      }
    }
  }

  return ticks;
}

function computeLayout(events: TimelineEvent[], containerWidth: number) {
  const timestamps = events.map((e) => fuzzyToTimestamp(e.start));
  const minTime = Math.min(...timestamps);
  const maxTime = Math.max(...timestamps);
  const timeRange = maxTime - minTime;

  let availableWidth = Math.max(containerWidth - PADDING * 2, 200);

  if (timeRange > 0) {
    let minTimeDiff = Infinity;
    for (let i = 1; i < timestamps.length; i++) {
      const diff = timestamps[i] - timestamps[i - 1];
      if (diff > 0 && diff < minTimeDiff) minTimeDiff = diff;
    }
    if (isFinite(minTimeDiff)) {
      const neededWidth = (timeRange / minTimeDiff) * MIN_GAP;
      availableWidth = Math.max(availableWidth, neededWidth);
    }
  }

  function timeToX(t: number): number {
    if (timeRange === 0) return PADDING;
    return PADDING + ((t - minTime) / timeRange) * availableWidth;
  }

  const positions = timestamps.map((t) => timeToX(t));
  for (let i = 1; i < positions.length; i++) {
    if (positions[i] - positions[i - 1] < MIN_GAP) {
      positions[i] = positions[i - 1] + MIN_GAP;
    }
  }

  const totalWidth = Math.max(containerWidth, (positions[positions.length - 1] ?? 0) + PADDING);
  const ticks = generateTicks(minTime, maxTime, timeRange);

  return { positions, totalWidth, timeRange, timeToX, ticks };
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

  const activeLanes = new Set(events.map((e) => e.lane));
  const legend = document.createElement("div");
  legend.className = styles.legend;
  for (const lane of LANE_ORDER) {
    const item = document.createElement("span");
    item.className = styles.legendItem;
    if (!activeLanes.has(lane)) item.dataset.inactive = "";
    const swatch = document.createElement("span");
    swatch.className = styles.swatch;
    swatch.style.backgroundColor = LANE_COLORS[lane];
    item.appendChild(swatch);
    item.appendChild(document.createTextNode(lane));
    legend.appendChild(item);
  }
  container.appendChild(legend);

  const { positions, totalWidth, timeToX, ticks } = computeLayout(events, container.clientWidth);

  const timeline = document.createElement("div");
  timeline.className = styles.timeline;
  timeline.style.width = `${totalWidth}px`;

  const axisLine = document.createElement("div");
  axisLine.className = styles.axisLine;
  timeline.appendChild(axisLine);

  for (const tick of ticks) {
    const x = timeToX(tick.time);

    const tickMark = document.createElement("div");
    tickMark.className = tick.minor ? styles.tickMinor : styles.tick;
    tickMark.style.left = `${x}px`;
    timeline.appendChild(tickMark);

    const tickLabel = document.createElement("span");
    tickLabel.className = tick.minor ? styles.tickLabelMinor : styles.tickLabel;
    tickLabel.style.left = `${x}px`;
    tickLabel.textContent = tick.label;
    timeline.appendChild(tickLabel);
  }

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const position = i % 2 === 0 ? "above" : "below";
    const color = LANE_COLORS[event.lane];
    const barHeight = 20 + event.salience * 30;
    const opacity = 0.4 + event.salience * 0.6;

    const el = document.createElement("div");
    el.className = styles.event;
    el.style.left = `${positions[i]}px`;
    el.dataset.position = position;
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

    const detailParts: string[] = [formatDate(event.start.iso, event.start.precision)];
    const extraDetail = eventDetail(event);
    if (extraDetail) detailParts.push(extraDetail);

    {
      const detailEl = document.createElement("span");
      detailEl.className = styles.detail;
      detailEl.textContent = detailParts.join(" · ");
      labelGroup.appendChild(detailEl);
    }

    el.appendChild(labelGroup);
    timeline.appendChild(el);
  }

  container.appendChild(timeline);
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

    const observer = new ResizeObserver(() => {
      if (containerRef.current) render(containerRef.current, events);
    });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [events]);

  return <div ref={containerRef} className={styles.container} />;
}

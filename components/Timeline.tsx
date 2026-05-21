// Alternating timeline: events branch above and below a horizontal axis,
// positioned proportionally to time. Related observations (vitals, lab
// panels, assessments) are grouped into single events with structured
// detail. Hovering or focusing highlights linked refs and dims unrelated.

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

type Reading = { label: string; value: unknown; unit: unknown; interpretation: unknown };
type Section = { name: string; readings: Reading[] };

function buildReading(event: TimelineEvent): Reading {
  return {
    label: event.label,
    value: event.detail.value,
    unit: event.detail.unit,
    interpretation: event.detail.interpretation,
  };
}

function buildLabGroup(members: TimelineEvent[]): TimelineEvent {
  const byPanel = new Map<string, TimelineEvent[]>();
  for (const m of members) {
    const panel = (m.detail.panel as string) ?? "";
    if (!byPanel.has(panel)) byPanel.set(panel, []);
    byPanel.get(panel)!.push(m);
  }

  const panelNames = [...byPanel.keys()].sort();
  const namedPanels = panelNames.filter((n) => n !== "");
  const label = namedPanels.length > 0 ? `Labs: ${namedPanels.join(", ")}` : "Lab results";

  const sections: Section[] = panelNames.map((name) => ({
    name: name || "Other",
    readings: byPanel
      .get(name)!
      .sort((a, b) => a.label.localeCompare(b.label))
      .map(buildReading),
  }));

  const maxSalience = Math.max(...members.map((m) => m.salience));
  const allRefs = [...new Set(members.flatMap((m) => m.refs))];
  const memberIds = members.map((m) => m.id);

  return {
    id: memberIds.join("+"),
    sourceType: "Observation",
    lane: "Labs",
    start: members[0].start,
    end: null,
    label,
    code: members[0].code,
    status: members[0].status,
    detail: { sections, category: "laboratory", memberIds },
    salience: maxSalience,
    refs: allRefs,
  };
}

function buildSimpleGroup(category: string, members: TimelineEvent[]): TimelineEvent {
  const groupLabel =
    category === "vital-signs"
      ? "Vitals"
      : category === "survey"
        ? "Assessments"
        : "Observations";

  const readings: Reading[] = members.map(buildReading);
  const maxSalience = Math.max(...members.map((m) => m.salience));
  const allRefs = [...new Set(members.flatMap((m) => m.refs))];
  const memberIds = members.map((m) => m.id);

  return {
    id: memberIds.join("+"),
    sourceType: "Observation",
    lane: "Labs",
    start: members[0].start,
    end: null,
    label: groupLabel,
    code: members[0].code,
    status: members[0].status,
    detail: { readings, category, memberIds },
    salience: maxSalience,
    refs: allRefs,
  };
}

function groupEvents(events: TimelineEvent[]): TimelineEvent[] {
  const result: TimelineEvent[] = [];
  const byCategory = new Map<string, Map<number, TimelineEvent[]>>();

  for (const event of events) {
    const category = event.sourceType === "Observation" ? (event.detail.category as string | null) : null;
    if (!category) {
      result.push(event);
      continue;
    }

    const ts = fuzzyToTimestamp(event.start);
    if (!byCategory.has(category)) byCategory.set(category, new Map());
    const byTime = byCategory.get(category)!;
    if (!byTime.has(ts)) byTime.set(ts, []);
    byTime.get(ts)!.push(event);
  }

  for (const [category, byTime] of byCategory) {
    for (const [, members] of byTime) {
      if (members.length === 1) {
        result.push(members[0]);
        continue;
      }
      if (category === "laboratory") {
        result.push(buildLabGroup(members));
      } else {
        result.push(buildSimpleGroup(category, members));
      }
    }
  }

  return result.sort((a, b) => fuzzyToTimestamp(a.start) - fuzzyToTimestamp(b.start));
}

function eventLabel(event: TimelineEvent): string {
  if (event.detail.readings || event.detail.sections) return event.label;
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

function eventDetailText(event: TimelineEvent): string {
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

function formatReading(r: Reading): string {
  const parts: string[] = [];
  if (r.value != null && r.unit) {
    parts.push(`${r.label}: ${r.value} ${r.unit}`);
  } else {
    parts.push(r.label as string);
  }
  if (r.interpretation) parts.push(`(${r.interpretation})`);
  return parts.join(" ");
}

function ariaLabel(event: TimelineEvent): string {
  const parts = [eventLabel(event), formatDate(event.start.iso, event.start.precision)];
  const sections = event.detail.sections as Section[] | undefined;
  if (sections) {
    for (const s of sections) {
      parts.push(s.name);
      for (const r of s.readings) parts.push(formatReading(r));
    }
  } else {
    const readings = event.detail.readings as Reading[] | undefined;
    if (readings) {
      for (const r of readings) parts.push(formatReading(r));
    } else {
      const detail = eventDetailText(event);
      if (detail) parts.push(detail);
    }
  }
  return parts.join(", ");
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

function connectedIds(eventId: string, events: TimelineEvent[]): Set<string> {
  const ids = new Set<string>();
  const source = events.find((e) => e.id === eventId);
  if (!source) return ids;

  for (const ref of source.refs) {
    for (const e of events) {
      const memberIds = e.detail.memberIds as string[] | undefined;
      if (e.id === ref || memberIds?.includes(ref)) {
        ids.add(e.id);
        break;
      }
    }
  }

  return ids;
}

function applyEmphasis(timeline: HTMLElement, hoveredId: string, related: Set<string>) {
  const eventEls = timeline.querySelectorAll<HTMLElement>(`.${styles.event}`);
  for (const el of eventEls) {
    const id = el.dataset.eventId ?? "";
    if (id === hoveredId) {
      el.dataset.emphasis = "hovered";
    } else if (related.has(id)) {
      el.dataset.emphasis = "related";
    } else {
      el.dataset.emphasis = "dimmed";
    }
  }
}

function clearEmphasis(timeline: HTMLElement) {
  const eventEls = timeline.querySelectorAll<HTMLElement>(`.${styles.event}`);
  for (const el of eventEls) {
    delete el.dataset.emphasis;
  }
}

function buildDetail(event: TimelineEvent): HTMLDivElement {
  const detail = document.createElement("div");
  detail.className = styles.detail;

  const dateLine = document.createElement("div");
  dateLine.textContent = formatDate(event.start.iso, event.start.precision);
  detail.appendChild(dateLine);

  const sections = event.detail.sections as Section[] | undefined;
  if (sections) {
    for (const section of sections) {
      const showHeader = sections.length > 1 || section.name !== "Other";
      if (showHeader) {
        const header = document.createElement("div");
        header.className = styles.detailSectionHeader;
        header.textContent = section.name;
        detail.appendChild(header);
      }
      for (const r of section.readings) {
        const line = document.createElement("div");
        line.textContent = formatReading(r);
        detail.appendChild(line);
      }
    }
    return detail;
  }

  const readings = event.detail.readings as Reading[] | undefined;
  if (readings) {
    for (const r of readings) {
      const line = document.createElement("div");
      line.textContent = formatReading(r);
      detail.appendChild(line);
    }
    return detail;
  }

  const extra = eventDetailText(event);
  if (extra) {
    const line = document.createElement("div");
    line.textContent = extra;
    detail.appendChild(line);
  }

  return detail;
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
  timeline.setAttribute("role", "list");
  timeline.setAttribute("aria-label", "Medical record timeline");

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

  function onFocusIn(eventId: string) {
    const related = connectedIds(eventId, events);
    applyEmphasis(timeline, eventId, related);
  }

  function onFocusOut() {
    clearEmphasis(timeline);
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
    el.dataset.eventId = event.id;
    el.setAttribute("role", "listitem");
    el.setAttribute("aria-label", ariaLabel(event));
    el.setAttribute("tabindex", "0");

    el.addEventListener("mouseenter", () => onFocusIn(event.id));
    el.addEventListener("mouseleave", onFocusOut);
    el.addEventListener("focus", () => onFocusIn(event.id));
    el.addEventListener("blur", onFocusOut);

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

    labelGroup.appendChild(buildDetail(event));

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
    const raw = bundleToEvents(bundle)
      .filter((e) => e.sourceType !== "Encounter")
      .sort((a, b) => fuzzyToTimestamp(a.start) - fuzzyToTimestamp(b.start));
    return groupEvents(raw);
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

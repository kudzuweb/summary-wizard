// Transforms a FHIR Bundle into TimelineEvent[] for the timeline renderer.
// Pure function: no I/O, no framework dependencies.

import type { Bundle } from "@/types/fhir";
import type { TimelineEvent, Coding } from "@/types/timeline";
import { parseFuzzyDate, fuzzyToTimestamp } from "./dates";

type FhirResource = Record<string, unknown>;

function getResource(entry: { resource?: unknown }): FhirResource | null {
  return (entry.resource as FhirResource) ?? null;
}

function resourceType(r: FhirResource): string {
  return r.resourceType as string;
}

function resourceId(entry: { fullUrl?: string; resource?: unknown }): string {
  const r = getResource(entry);
  const id = r?.id as string | undefined;
  return id ?? entry.fullUrl ?? "";
}

function extractLabel(r: FhirResource): string {
  const code = r.code as { text?: string; coding?: Coding[] } | undefined;
  if (code?.text) return code.text;
  if (code?.coding?.[0]?.display) return code.coding[0].display;
  if (code?.coding?.[0]?.code) return code.coding[0].code;

  const medCode = r.medicationCodeableConcept as { text?: string; coding?: Coding[] } | undefined;
  if (medCode?.text) return medCode.text;
  if (medCode?.coding?.[0]?.display) return medCode.coding[0].display;

  return resourceType(r);
}

function extractCoding(r: FhirResource): Coding {
  const code = r.code as { coding?: Coding[] } | undefined;
  const medCode = r.medicationCodeableConcept as { coding?: Coding[] } | undefined;
  const coding = code?.coding?.[0] ?? medCode?.coding?.[0];
  return coding ?? {};
}

function extractStatus(r: FhirResource): string {
  const clinicalStatus = r.clinicalStatus as { coding?: { code?: string }[] } | undefined;
  if (clinicalStatus?.coding?.[0]?.code) return clinicalStatus.coding[0].code;
  return (r.status as string) ?? "unknown";
}

function resolveRef(ref: string | undefined): string | null {
  if (!ref) return null;
  return ref;
}

function extractPeriodDate(obj: unknown, field: string): string | undefined {
  const period = (obj as FhirResource)?.[field] as { start?: string; end?: string } | undefined;
  if (typeof period === "string") return period;
  return undefined;
}

function mapCondition(r: FhirResource): Pick<TimelineEvent, "start" | "end" | "lane" | "detail"> | null {
  const onsetStr =
    (r.onsetDateTime as string) ??
    extractPeriodDate(r, "onsetPeriod") ??
    (r.recordedDate as string);
  const start = parseFuzzyDate(onsetStr);
  if (!start) return null;

  const abatementStr =
    (r.abatementDateTime as string) ??
    extractPeriodDate(r, "abatementPeriod");
  const end = parseFuzzyDate(abatementStr);

  return {
    start,
    end,
    lane: "Problems",
    detail: { status: extractStatus(r), onset: onsetStr, abatement: abatementStr ?? null },
  };
}

function mapMedicationRequest(r: FhirResource): Pick<TimelineEvent, "start" | "end" | "lane" | "detail"> | null {
  const authoredOn = r.authoredOn as string | undefined;
  const start = parseFuzzyDate(authoredOn);
  if (!start) return null;

  const dispenseRequest = r.dispenseRequest as { validityPeriod?: { end?: string } } | undefined;
  const endStr = dispenseRequest?.validityPeriod?.end;
  const end = parseFuzzyDate(endStr);

  const dosage = r.dosageInstruction as { patientInstruction?: string; text?: string }[] | undefined;
  const dosageText = dosage?.[0]?.patientInstruction ?? dosage?.[0]?.text ?? null;

  return {
    start,
    end,
    lane: "Medications",
    detail: { status: extractStatus(r), authoredOn, dosage: dosageText },
  };
}

function mapMedicationStatement(r: FhirResource): Pick<TimelineEvent, "start" | "end" | "lane" | "detail"> | null {
  const period = r.effectivePeriod as { start?: string; end?: string } | undefined;
  const start = parseFuzzyDate(period?.start);
  if (!start) return null;

  return {
    start,
    end: parseFuzzyDate(period?.end),
    lane: "Medications",
    detail: { status: extractStatus(r) },
  };
}

function mapProcedure(r: FhirResource): Pick<TimelineEvent, "start" | "end" | "lane" | "detail"> | null {
  const performedDt = r.performedDateTime as string | undefined;
  const performedPeriod = r.performedPeriod as { start?: string; end?: string } | undefined;
  const startStr = performedDt ?? performedPeriod?.start;
  const start = parseFuzzyDate(startStr);
  if (!start) return null;

  const end = performedPeriod ? parseFuzzyDate(performedPeriod.end) : null;

  return {
    start,
    end,
    lane: "Procedures",
    detail: { status: extractStatus(r) },
  };
}

function mapEncounter(r: FhirResource): Pick<TimelineEvent, "start" | "end" | "lane" | "detail"> | null {
  const period = r.period as { start?: string; end?: string } | undefined;
  const start = parseFuzzyDate(period?.start);
  if (!start) return null;

  return {
    start,
    end: parseFuzzyDate(period?.end),
    lane: "Visits",
    detail: { status: extractStatus(r), class: (r.class as { display?: string })?.display ?? null },
  };
}

const VITAL_SIGN_LOINC = new Set([
  "8302-2", "29463-7", "85354-9", "8480-6", "8462-4", "8310-5",
  "8867-4", "9279-1", "2708-6", "59408-5", "39156-5", "3141-9",
  "8478-0", "8287-5",
]);

const VITAL_SIGN_PATTERNS = [
  "body weight", "body height", "blood pressure", "body temperature",
  "heart rate", "respiratory rate", "oxygen saturation", "bmi",
  "body mass index", "pulse oximetry", "systolic", "diastolic",
];

const SURVEY_PATTERNS = [
  "phq", "gad", "questionnaire", "assessment score", "survey",
  "edinburgh", "audit", "dast", "cage",
];

function inferObservationCategory(r: FhirResource): string | null {
  const categories = r.category as { coding?: { code?: string }[] }[] | undefined;
  const explicit = categories?.[0]?.coding?.[0]?.code;
  if (explicit) return explicit;

  const coding = (r.code as { coding?: Coding[] })?.coding?.[0];
  if (coding?.code && VITAL_SIGN_LOINC.has(coding.code)) return "vital-signs";

  const label = extractLabel(r).toLowerCase();
  if (VITAL_SIGN_PATTERNS.some((p) => label.includes(p))) return "vital-signs";
  if (SURVEY_PATTERNS.some((p) => label.includes(p))) return "survey";

  return "laboratory";
}

function mapObservation(r: FhirResource): Pick<TimelineEvent, "start" | "end" | "lane" | "detail"> | null {
  const effectiveDt = r.effectiveDateTime as string | undefined;
  const start = parseFuzzyDate(effectiveDt);
  if (!start) return null;

  const valueQuantity = r.valueQuantity as { value?: number; unit?: string } | undefined;
  const interpretation = r.interpretation as { coding?: { code?: string }[] }[] | undefined;
  const interpCode = interpretation?.[0]?.coding?.[0]?.code ?? null;

  const category = inferObservationCategory(r);

  return {
    start,
    end: null,
    lane: "Labs",
    detail: {
      value: valueQuantity?.value ?? null,
      unit: valueQuantity?.unit ?? null,
      interpretation: interpCode,
      category,
    },
  };
}

function mapImmunization(r: FhirResource): Pick<TimelineEvent, "start" | "end" | "lane" | "detail"> | null {
  const occurrenceDt = r.occurrenceDateTime as string | undefined;
  const start = parseFuzzyDate(occurrenceDt);
  if (!start) return null;

  return {
    start,
    end: null,
    lane: "Immunizations",
    detail: { status: extractStatus(r) },
  };
}

const RESOURCE_MAPPERS: Record<string, (r: FhirResource) => Pick<TimelineEvent, "start" | "end" | "lane" | "detail"> | null> = {
  Condition: mapCondition,
  MedicationRequest: mapMedicationRequest,
  MedicationStatement: mapMedicationStatement,
  Procedure: mapProcedure,
  Encounter: mapEncounter,
  Observation: mapObservation,
  Immunization: mapImmunization,
};

function isAbnormalInterpretation(detail: Record<string, unknown>): boolean {
  const interp = detail.interpretation as string | null;
  if (!interp) return false;
  return ["H", "L", "A", "HH", "LL", "AA", "HU", "LU"].includes(interp);
}

function isActiveStatus(status: string): boolean {
  return ["active", "in-progress", "current"].includes(status.toLowerCase());
}

function computeSalience(
  event: TimelineEvent,
  maxTimestamp: number,
  refCounts: Map<string, number>,
): number {
  let score = 0.3;

  if (isActiveStatus(event.status)) {
    score += 0.3;
  } else {
    score += 0.1;
  }

  if (isAbnormalInterpretation(event.detail)) {
    score += 0.2;
  }

  if (maxTimestamp > 0) {
    const eventTs = fuzzyToTimestamp(event.start);
    const recency = Math.max(0, eventTs / maxTimestamp);
    score += recency * 0.2;
  }

  const inboundRefs = refCounts.get(event.id) ?? 0;
  score += Math.min(inboundRefs * 0.05, 0.2);

  return Math.min(1, Math.max(0, score));
}

function walkReferences(entries: { fullUrl?: string; resource?: unknown }[], events: TimelineEvent[]): void {
  const eventById = new Map<string, TimelineEvent>();
  for (const event of events) {
    eventById.set(event.id, event);
  }

  const fullUrlToId = new Map<string, string>();
  for (const entry of entries) {
    const r = getResource(entry);
    if (!r) continue;
    const id = resourceId(entry);
    if (entry.fullUrl) fullUrlToId.set(entry.fullUrl, id);
  }

  function link(fromId: string, toRef: string) {
    const toId = fullUrlToId.get(toRef) ?? toRef;
    const fromEvent = eventById.get(fromId);
    const toEvent = eventById.get(toId);
    if (fromEvent && toEvent) {
      if (!fromEvent.refs.includes(toId)) fromEvent.refs.push(toId);
      if (!toEvent.refs.includes(fromId)) toEvent.refs.push(fromId);
    }
  }

  for (const entry of entries) {
    const r = getResource(entry);
    if (!r) continue;
    const id = resourceId(entry);
    const type = resourceType(r);

    if (type === "MedicationRequest" || type === "Procedure") {
      const reasons = r.reasonReference as { reference?: string }[] | undefined;
      if (Array.isArray(reasons)) {
        for (const reason of reasons) {
          const ref = resolveRef(reason.reference);
          if (ref) link(id, ref);
        }
      }
    }

    const encounterRef = (r.encounter as { reference?: string })?.reference;
    if (encounterRef) {
      link(id, encounterRef);
    }

    if (type === "DiagnosticReport") {
      const results = r.result as { reference?: string }[] | undefined;
      if (Array.isArray(results)) {
        for (const result of results) {
          const ref = resolveRef(result.reference);
          if (ref) link(id, ref);
        }
      }
    }
  }
}

function buildPanelMap(entries: { fullUrl?: string; resource?: unknown }[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of entries) {
    const r = getResource(entry);
    if (!r || resourceType(r) !== "DiagnosticReport") continue;
    const name = extractLabel(r);
    const results = r.result as { reference?: string }[] | undefined;
    if (!results) continue;
    for (const result of results) {
      if (result.reference) map.set(result.reference, name);
    }
  }
  return map;
}

export function bundleToEvents(bundle: Bundle): TimelineEvent[] {
  const entries = bundle.entry ?? [];
  const panelMap = buildPanelMap(entries);
  const events: TimelineEvent[] = [];

  for (const entry of entries) {
    const r = getResource(entry);
    if (!r) continue;

    const type = resourceType(r);
    const mapper = RESOURCE_MAPPERS[type];
    if (!mapper) continue;

    const mapped = mapper(r);
    if (!mapped) continue;

    if (type === "Observation") {
      const panelName = panelMap.get(entry.fullUrl ?? "") ?? panelMap.get(resourceId(entry));
      if (panelName) mapped.detail.panel = panelName;
    }

    events.push({
      id: resourceId(entry),
      sourceType: type,
      lane: mapped.lane,
      start: mapped.start,
      end: mapped.end,
      label: extractLabel(r),
      code: extractCoding(r),
      status: extractStatus(r),
      detail: mapped.detail,
      salience: 0,
      refs: [],
    });
  }

  walkReferences(entries, events);

  const maxTimestamp = events.reduce((max, e) => {
    const ts = fuzzyToTimestamp(e.start);
    return ts > max ? ts : max;
  }, 0);

  const refCounts = new Map<string, number>();
  for (const event of events) {
    refCounts.set(event.id, event.refs.length);
  }

  for (const event of events) {
    event.salience = computeSalience(event, maxTimestamp, refCounts);
  }

  return events;
}

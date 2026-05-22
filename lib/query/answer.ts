// Formats a natural-language answer from matched FHIR resources.
// Every fact in the answer is derived from the matches array — never fabricated.

import fhirpath from "fhirpath";
import type { SearchResult } from "./execute";

type FhirResource = Record<string, unknown>;

function extractDate(resource: FhirResource): string | null {
  const paths = [
    "authoredOn",
    "onsetDateTime",
    "effectiveDateTime",
    "occurrenceDateTime",
    "recordedDate",
    "period.start",
    "onsetPeriod.start",
    "effectivePeriod.start",
    "performedDateTime",
    "performedPeriod.start",
  ];

  for (const path of paths) {
    const vals = fhirpath.evaluate(resource, path) as string[];
    if (vals[0] && typeof vals[0] === "string") return vals[0];
  }

  return null;
}

function extractLabel(resource: FhirResource): string {
  const labelPaths = [
    "code.text",
    "code.coding.display",
    "medicationCodeableConcept.text",
    "medicationCodeableConcept.coding.display",
    "vaccineCode.text",
    "vaccineCode.coding.display",
  ];

  for (const path of labelPaths) {
    const vals = fhirpath.evaluate(resource, path) as string[];
    if (vals[0] && typeof vals[0] === "string") return vals[0];
  }

  return (resource.resourceType as string) ?? "Unknown resource";
}

function extractStatus(resource: FhirResource): string | null {
  const clinicalStatus = fhirpath.evaluate(resource, "clinicalStatus.coding.code") as string[];
  if (clinicalStatus[0]) return clinicalStatus[0];

  const status = fhirpath.evaluate(resource, "status") as string[];
  return status[0] ?? null;
}

function formatDate(dateStr: string): string {
  if (/^\d{4}$/.test(dateStr)) return dateStr;
  if (/^\d{4}-\d{2}$/.test(dateStr)) {
    const [y, m] = dateStr.split("-");
    const months = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];
    return `${months[parseInt(m, 10) - 1]} ${y}`;
  }
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function isFirstPrescribedQuestion(question: string): boolean {
  const q = question.toLowerCase();
  return (q.includes("first") && q.includes("prescri")) ||
    (q.includes("when") && q.includes("prescri")) ||
    (q.includes("earliest") && q.includes("prescri")) ||
    (q.includes("first") && q.includes("start"));
}

function isEverHadQuestion(question: string): boolean {
  const q = question.toLowerCase();
  return (q.includes("ever") && (q.includes("had") || q.includes("diagnos") || q.includes("have"))) ||
    (q.includes("history of") || q.includes("has the patient"));
}

export interface FormattedAnswer {
  text: string;
  evidence: Evidence[];
}

export interface Evidence {
  label: string;
  date: string | null;
  status: string | null;
  resourceType: string;
}

function buildEvidence(results: SearchResult[]): Evidence[] {
  return results.map((r) => ({
    label: extractLabel(r.resource),
    date: extractDate(r.resource),
    status: extractStatus(r.resource),
    resourceType: (r.resource.resourceType as string) ?? "Unknown",
  }));
}

export function formatAnswer(
  question: string,
  resourceType: string,
  matches: SearchResult[],
): FormattedAnswer {
  const evidence = buildEvidence(matches);

  if (matches.length === 0) {
    return {
      text: `No ${resourceType} records were found matching your query.`,
      evidence: [],
    };
  }

  if (isFirstPrescribedQuestion(question)) {
    const sorted = [...matches].sort((a, b) => {
      const aDate = extractDate(a.resource);
      const bDate = extractDate(b.resource);
      if (!aDate) return 1;
      if (!bDate) return -1;
      return aDate.localeCompare(bDate);
    });

    const earliest = sorted[0];
    const label = extractLabel(earliest.resource);
    const date = extractDate(earliest.resource);

    if (date) {
      return {
        text: `${label} was first prescribed on ${formatDate(date)}.`,
        evidence,
      };
    }

    return {
      text: `${label} was prescribed, but no date is recorded.`,
      evidence,
    };
  }

  if (isEverHadQuestion(question)) {
    const labels = matches.map((m) => extractLabel(m.resource));
    const unique = [...new Set(labels)];
    const dates = matches
      .map((m) => extractDate(m.resource))
      .filter((d): d is string => d !== null)
      .map(formatDate);

    const conditionList = unique.join(", ");
    const dateInfo = dates.length > 0 ? ` (${dates.join("; ")})` : "";

    return {
      text: `Yes, the patient has a record of: ${conditionList}${dateInfo}.`,
      evidence,
    };
  }

  if (matches.length === 1) {
    const r = matches[0];
    const label = extractLabel(r.resource);
    const date = extractDate(r.resource);
    const status = extractStatus(r.resource);
    const parts = [label];
    if (date) parts.push(`on ${formatDate(date)}`);
    if (status) parts.push(`(${status})`);

    return {
      text: `Found: ${parts.join(" ")}.`,
      evidence,
    };
  }

  const summaryLines = matches.slice(0, 10).map((m) => {
    const label = extractLabel(m.resource);
    const date = extractDate(m.resource);
    const status = extractStatus(m.resource);
    const parts = [label];
    if (date) parts.push(formatDate(date));
    if (status) parts.push(`(${status})`);
    return parts.join(" — ");
  });

  const countNote = matches.length > 10 ? ` (showing 10 of ${matches.length})` : "";

  return {
    text: `Found ${matches.length} ${resourceType} records${countNote}:\n${summaryLines.map((l) => `• ${l}`).join("\n")}`,
    evidence,
  };
}

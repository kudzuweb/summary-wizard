// Executes FHIR search params against an in-memory Bundle.
// Filters entries by resourceType, then applies each search param
// using fhirpath for field extraction.

import fhirpath from "fhirpath";
import type { Bundle } from "@/types/fhir";

type FhirResource = Record<string, unknown>;

export interface SearchResult {
  resource: FhirResource;
  fullUrl?: string;
}

const DATE_FIELDS: Record<string, string> = {
  date: "date",
  authoredon: "authoredOn",
  authored: "authoredOn",
  onset: "onset",
  recorded: "recordedDate",
  effective: "effectiveDateTime",
  occurrence: "occurrenceDateTime",
  issued: "issued",
  period: "period.start",
};

const SORT_PATHS: Record<string, string> = {
  date: "date",
  authoredon: "authoredOn",
  onset: "onsetDateTime | onsetPeriod.start",
  effective: "effectiveDateTime",
  occurrence: "occurrenceDateTime",
  period: "period.start",
  _lastUpdated: "meta.lastUpdated",
};

function parseSearchParams(queryString: string): URLSearchParams {
  return new URLSearchParams(queryString);
}

function matchesCode(resource: FhirResource, value: string): boolean {
  const searchLower = value.toLowerCase();

  const codePaths = [
    "code.coding.code",
    "code.coding.display",
    "code.text",
    "medicationCodeableConcept.coding.code",
    "medicationCodeableConcept.coding.display",
    "medicationCodeableConcept.text",
    "vaccineCode.coding.code",
    "vaccineCode.coding.display",
    "vaccineCode.text",
  ];

  for (const path of codePaths) {
    const results = fhirpath.evaluate(resource, path) as string[];
    for (const result of results) {
      if (typeof result === "string" && result.toLowerCase().includes(searchLower)) {
        return true;
      }
    }
  }

  return false;
}

function matchesStatus(resource: FhirResource, value: string): boolean {
  const statusLower = value.toLowerCase();

  const clinicalStatus = fhirpath.evaluate(resource, "clinicalStatus.coding.code") as string[];
  if (clinicalStatus.some((s) => typeof s === "string" && s.toLowerCase() === statusLower)) {
    return true;
  }

  const status = fhirpath.evaluate(resource, "status") as string[];
  return status.some((s) => typeof s === "string" && s.toLowerCase() === statusLower);
}

type DatePrefix = "eq" | "lt" | "le" | "gt" | "ge";

function parseDateParam(value: string): { prefix: DatePrefix; date: string } {
  const prefixMatch = value.match(/^(eq|lt|le|gt|ge)(.+)$/);
  if (prefixMatch) {
    return { prefix: prefixMatch[1] as DatePrefix, date: prefixMatch[2] };
  }
  return { prefix: "eq", date: value };
}

function toComparableDate(dateStr: string): number {
  return new Date(dateStr).getTime();
}

function compareDates(resourceDate: string, searchDate: string, prefix: DatePrefix): boolean {
  const rd = toComparableDate(resourceDate);
  const sd = toComparableDate(searchDate);
  if (isNaN(rd) || isNaN(sd)) return false;

  switch (prefix) {
    case "eq": return rd === sd;
    case "lt": return rd < sd;
    case "le": return rd <= sd;
    case "gt": return rd > sd;
    case "ge": return rd >= sd;
  }
}

function matchesDateParam(resource: FhirResource, paramName: string, paramValue: string): boolean {
  const { prefix, date } = parseDateParam(paramValue);

  const fieldName = DATE_FIELDS[paramName.toLowerCase()];
  if (!fieldName) return true;

  const datePaths = [
    fieldName,
    `${fieldName}DateTime`,
    `${fieldName}Period.start`,
  ];

  for (const path of datePaths) {
    const values = fhirpath.evaluate(resource, path) as string[];
    for (const val of values) {
      if (typeof val === "string" && compareDates(val, date, prefix)) {
        return true;
      }
    }
  }

  return false;
}

function applySort(results: SearchResult[], sortParam: string): SearchResult[] {
  if (!sortParam) return results;

  const descending = sortParam.startsWith("-");
  const field = descending ? sortParam.slice(1) : sortParam;
  const fhirField = SORT_PATHS[field.toLowerCase()] ?? field;

  return [...results].sort((a, b) => {
    const aVals = fhirpath.evaluate(a.resource, fhirField) as string[];
    const bVals = fhirpath.evaluate(b.resource, fhirField) as string[];
    const aDate = aVals[0] ? toComparableDate(String(aVals[0])) : 0;
    const bDate = bVals[0] ? toComparableDate(String(bVals[0])) : 0;
    return descending ? bDate - aDate : aDate - bDate;
  });
}

export function executeSearch(
  bundle: Bundle,
  resourceType: string,
  searchParams: string,
): SearchResult[] {
  const entries = bundle.entry ?? [];
  const params = parseSearchParams(searchParams);

  let results: SearchResult[] = entries
    .filter((entry) => {
      const r = entry.resource as FhirResource | undefined;
      return r && (r.resourceType as string) === resourceType;
    })
    .map((entry) => ({
      resource: entry.resource as FhirResource,
      fullUrl: entry.fullUrl,
    }));

  for (const [key, value] of params.entries()) {
    if (key === "_sort" || key === "_count") continue;

    if (key === "code" || key === "medication" || key === "vaccine-code") {
      results = results.filter((r) => matchesCode(r.resource, value));
    } else if (key === "status" || key === "clinical-status") {
      results = results.filter((r) => matchesStatus(r.resource, value));
    } else if (DATE_FIELDS[key.toLowerCase()]) {
      results = results.filter((r) => matchesDateParam(r.resource, key, value));
    }
  }

  const sortParam = params.get("_sort");
  if (sortParam) {
    results = applySort(results, sortParam);
  }

  const count = params.get("_count");
  if (count) {
    const n = parseInt(count, 10);
    if (!isNaN(n) && n > 0) {
      results = results.slice(0, n);
    }
  }

  return results;
}

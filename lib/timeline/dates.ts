// Parses FHIR date strings into FuzzyDate values, inferring precision from
// the string format: "2019" → year, "2019-03" → month, "2019-03-14" → day,
// anything with a time component → instant.

import type { DatePrecision, FuzzyDate } from "@/types/timeline";

const YEAR_RE = /^\d{4}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseFuzzyDate(value: string | undefined): FuzzyDate | null {
  if (!value) return null;

  let precision: DatePrecision;

  if (YEAR_RE.test(value)) {
    precision = "year";
  } else if (MONTH_RE.test(value)) {
    precision = "month";
  } else if (DAY_RE.test(value)) {
    precision = "day";
  } else {
    precision = "instant";
  }

  return { iso: value, precision };
}

export function fuzzyToTimestamp(date: FuzzyDate): number {
  return new Date(date.iso).getTime();
}

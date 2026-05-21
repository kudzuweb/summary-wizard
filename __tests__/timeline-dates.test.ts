// Tests for parseFuzzyDate: precision inference from FHIR date strings.

import { describe, it, expect } from "vitest";
import { parseFuzzyDate } from "@/lib/timeline/dates";

describe("parseFuzzyDate", () => {
  it("returns null for undefined input", () => {
    expect(parseFuzzyDate(undefined)).toBeNull();
  });

  it("parses year precision", () => {
    const result = parseFuzzyDate("2019");
    expect(result).toEqual({ iso: "2019", precision: "year" });
  });

  it("parses month precision", () => {
    const result = parseFuzzyDate("2019-03");
    expect(result).toEqual({ iso: "2019-03", precision: "month" });
  });

  it("parses day precision", () => {
    const result = parseFuzzyDate("2019-03-14");
    expect(result).toEqual({ iso: "2019-03-14", precision: "day" });
  });

  it("parses instant precision from datetime with time", () => {
    const result = parseFuzzyDate("2019-03-14T10:30:00Z");
    expect(result).toEqual({ iso: "2019-03-14T10:30:00Z", precision: "instant" });
  });

  it("parses instant precision from datetime with timezone offset", () => {
    const result = parseFuzzyDate("2019-03-14T10:30:00+05:00");
    expect(result).toEqual({ iso: "2019-03-14T10:30:00+05:00", precision: "instant" });
  });
});

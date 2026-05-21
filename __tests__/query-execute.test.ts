import { describe, it, expect } from "vitest";
import { executeSearch } from "@/lib/query/execute";
import { formatAnswer } from "@/lib/query/answer";
import type { Bundle } from "@/types/fhir";

const syntheticBundle: Bundle = {
  resourceType: "Bundle",
  type: "transaction",
  entry: [
    {
      fullUrl: "urn:uuid:p1",
      resource: {
        resourceType: "Patient",
        id: "p1",
        name: [{ given: ["Jane"], family: "Doe" }],
      } as never,
    },
    {
      fullUrl: "urn:uuid:cond-diabetes",
      resource: {
        resourceType: "Condition",
        id: "cond-diabetes",
        clinicalStatus: { coding: [{ code: "active" }] },
        code: {
          text: "Type 2 Diabetes",
          coding: [{ system: "http://snomed.info/sct", code: "73211009", display: "Diabetes mellitus" }],
        },
        onsetDateTime: "2019-03-10",
        subject: { reference: "urn:uuid:p1" },
      } as never,
    },
    {
      fullUrl: "urn:uuid:cond-bronchitis",
      resource: {
        resourceType: "Condition",
        id: "cond-bronchitis",
        clinicalStatus: { coding: [{ code: "resolved" }] },
        code: { text: "Acute bronchitis", coding: [{ code: "10509002" }] },
        onsetDateTime: "2023-06-10",
        abatementDateTime: "2023-06-24",
        subject: { reference: "urn:uuid:p1" },
      } as never,
    },
    {
      fullUrl: "urn:uuid:med-metformin",
      resource: {
        resourceType: "MedicationRequest",
        id: "med-metformin",
        status: "active",
        intent: "order",
        medicationCodeableConcept: {
          text: "Metformin 500mg",
          coding: [{ display: "Metformin 500mg", code: "860975" }],
        },
        authoredOn: "2024-03-15",
        dosageInstruction: [{ patientInstruction: "twice daily" }],
        subject: { reference: "urn:uuid:p1" },
      } as never,
    },
    {
      fullUrl: "urn:uuid:med-metformin-early",
      resource: {
        resourceType: "MedicationRequest",
        id: "med-metformin-early",
        status: "completed",
        intent: "order",
        medicationCodeableConcept: {
          text: "Metformin 500mg",
          coding: [{ display: "Metformin 500mg", code: "860975" }],
        },
        authoredOn: "2019-04-01",
        subject: { reference: "urn:uuid:p1" },
      } as never,
    },
    {
      fullUrl: "urn:uuid:obs-hba1c",
      resource: {
        resourceType: "Observation",
        id: "obs-hba1c",
        status: "final",
        code: { text: "HbA1c", coding: [{ display: "Hemoglobin A1c" }] },
        effectiveDateTime: "2024-03-15",
        valueQuantity: { value: 9.2, unit: "%" },
        interpretation: [{ coding: [{ code: "H" }] }],
        subject: { reference: "urn:uuid:p1" },
      } as never,
    },
    {
      fullUrl: "urn:uuid:imm-flu",
      resource: {
        resourceType: "Immunization",
        id: "imm-flu",
        status: "completed",
        vaccineCode: { text: "Influenza vaccine", coding: [{ display: "Influenza vaccine" }] },
        occurrenceDateTime: "2024-01-10",
        patient: { reference: "urn:uuid:p1" },
      } as never,
    },
  ],
};

describe("executeSearch", () => {
  it("filters by resourceType", () => {
    const results = executeSearch(syntheticBundle, "Condition", "");
    expect(results).toHaveLength(2);
    expect(results.every((r) => (r.resource.resourceType as string) === "Condition")).toBe(true);
  });

  it("filters by code text match", () => {
    const results = executeSearch(syntheticBundle, "MedicationRequest", "code=metformin");
    expect(results).toHaveLength(2);
  });

  it("filters by code — case insensitive", () => {
    const results = executeSearch(syntheticBundle, "MedicationRequest", "code=METFORMIN");
    expect(results).toHaveLength(2);
  });

  it("filters by status", () => {
    const results = executeSearch(syntheticBundle, "Condition", "clinical-status=active");
    expect(results).toHaveLength(1);
    expect((results[0].resource.id as string)).toBe("cond-diabetes");
  });

  it("returns empty array for no matches", () => {
    const results = executeSearch(syntheticBundle, "MedicationRequest", "code=aspirin");
    expect(results).toHaveLength(0);
  });

  it("parses date prefix le (less-than-or-equal)", () => {
    const results = executeSearch(syntheticBundle, "MedicationRequest", "code=metformin&authoredon=le2026-05-21");
    expect(results).toHaveLength(2);
  });

  it("applies _sort by date ascending", () => {
    const results = executeSearch(syntheticBundle, "MedicationRequest", "code=metformin&_sort=authoredon");
    expect(results).toHaveLength(2);
    expect((results[0].resource.id as string)).toBe("med-metformin-early");
    expect((results[1].resource.id as string)).toBe("med-metformin");
  });

  it("applies _sort descending with - prefix", () => {
    const results = executeSearch(syntheticBundle, "MedicationRequest", "code=metformin&_sort=-authoredon");
    expect(results).toHaveLength(2);
    expect((results[0].resource.id as string)).toBe("med-metformin");
  });

  it("applies _count to limit results", () => {
    const results = executeSearch(syntheticBundle, "MedicationRequest", "code=metformin&_sort=authoredon&_count=1");
    expect(results).toHaveLength(1);
    expect((results[0].resource.id as string)).toBe("med-metformin-early");
  });

  it("handles vaccine-code param for Immunization", () => {
    const results = executeSearch(syntheticBundle, "Immunization", "vaccine-code=influenza");
    expect(results).toHaveLength(1);
  });
});

describe("formatAnswer", () => {
  it("returns 'first prescribed' answer with earliest date", () => {
    const matches = executeSearch(syntheticBundle, "MedicationRequest", "code=metformin&_sort=authoredon");
    const answer = formatAnswer("when was metformin first prescribed", "MedicationRequest", matches);

    expect(answer.text).toContain("Metformin 500mg");
    expect(answer.text).toContain("2019");
    expect(answer.evidence).toHaveLength(2);
    expect(answer.evidence[0].date).toBe("2019-04-01");
  });

  it("returns 'ever had' answer with yes and dates for matching diagnosis", () => {
    const matches = executeSearch(syntheticBundle, "Condition", "code=diabetes");
    const answer = formatAnswer("has the patient ever had diabetes", "Condition", matches);

    expect(answer.text.toLowerCase()).toContain("yes");
    expect(answer.text).toContain("Type 2 Diabetes");
    expect(answer.evidence).toHaveLength(1);
    expect(answer.evidence[0].date).toBe("2019-03-10");
  });

  it("returns 'no results' for non-matching diagnosis", () => {
    const matches = executeSearch(syntheticBundle, "Condition", "code=lupus");
    const answer = formatAnswer("has the patient ever had lupus", "Condition", matches);

    expect(answer.text.toLowerCase()).toContain("no");
    expect(answer.evidence).toHaveLength(0);
  });

  it("never fabricates facts — zero matches produce no-results answer", () => {
    const matches = executeSearch(syntheticBundle, "MedicationRequest", "code=nonexistent");
    const answer = formatAnswer("when was nonexistent first prescribed", "MedicationRequest", matches);

    expect(answer.text).toContain("No MedicationRequest records");
    expect(answer.evidence).toHaveLength(0);
  });

  it("includes evidence for every match", () => {
    const matches = executeSearch(syntheticBundle, "MedicationRequest", "code=metformin");
    const answer = formatAnswer("what medications does the patient take", "MedicationRequest", matches);

    expect(answer.evidence).toHaveLength(2);
    for (const e of answer.evidence) {
      expect(e.label).toBeTruthy();
      expect(e.resourceType).toBe("MedicationRequest");
    }
  });
});

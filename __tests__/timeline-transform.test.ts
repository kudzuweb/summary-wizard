// Tests for bundleToEvents: FHIR bundle → TimelineEvent[] mapping.
// Uses a synthetic bundle covering: chronic active condition, resolved
// condition, medication linked to condition, abnormal lab, encounter,
// immunization, allergy (should be excluded), and year-precision date.

import { describe, it, expect } from "vitest";
import { bundleToEvents } from "@/lib/timeline/transform";
import type { Bundle } from "@/types/fhir";

const syntheticBundle: Bundle = {
  resourceType: "Bundle",
  type: "transaction",
  entry: [
    {
      fullUrl: "urn:uuid:enc-1",
      resource: {
        resourceType: "Encounter",
        id: "enc-1",
        status: "finished",
        class: { code: "AMB", display: "Ambulatory" },
        period: { start: "2024-03-15", end: "2024-03-15" },
      } as never,
    },
    {
      fullUrl: "urn:uuid:cond-active",
      resource: {
        resourceType: "Condition",
        id: "cond-active",
        subject: { reference: "urn:uuid:p1" },
        clinicalStatus: { coding: [{ code: "active" }] },
        code: { text: "Type 2 Diabetes", coding: [{ system: "http://snomed.info/sct", code: "73211009", display: "Diabetes mellitus" }] },
        onsetDateTime: "2019",
        encounter: { reference: "urn:uuid:enc-1" },
      } as never,
    },
    {
      fullUrl: "urn:uuid:cond-resolved",
      resource: {
        resourceType: "Condition",
        id: "cond-resolved",
        subject: { reference: "urn:uuid:p1" },
        clinicalStatus: { coding: [{ code: "resolved" }] },
        code: { text: "Acute bronchitis", coding: [{ code: "10509002" }] },
        onsetDateTime: "2023-06-10",
        abatementDateTime: "2023-06-24",
      } as never,
    },
    {
      fullUrl: "urn:uuid:med-1",
      resource: {
        resourceType: "MedicationRequest",
        id: "med-1",
        status: "active",
        intent: "order",
        subject: { reference: "urn:uuid:p1" },
        medicationCodeableConcept: { coding: [{ display: "Metformin 500mg" }] },
        authoredOn: "2024-03-15",
        dosageInstruction: [{ patientInstruction: "twice daily" }],
        reasonReference: [{ reference: "urn:uuid:cond-active" }],
        encounter: { reference: "urn:uuid:enc-1" },
      } as never,
    },
    {
      fullUrl: "urn:uuid:obs-abnormal",
      resource: {
        resourceType: "Observation",
        id: "obs-abnormal",
        status: "final",
        code: { text: "HbA1c", coding: [{ display: "Hemoglobin A1c" }] },
        effectiveDateTime: "2024-03-15",
        valueQuantity: { value: 9.2, unit: "%" },
        interpretation: [{ coding: [{ code: "H" }] }],
        encounter: { reference: "urn:uuid:enc-1" },
      } as never,
    },
    {
      fullUrl: "urn:uuid:imm-1",
      resource: {
        resourceType: "Immunization",
        id: "imm-1",
        status: "completed",
        vaccineCode: { text: "Influenza vaccine" },
        occurrenceDateTime: "2024-01-10",
      } as never,
    },
    {
      fullUrl: "urn:uuid:allergy-1",
      resource: {
        resourceType: "AllergyIntolerance",
        id: "allergy-1",
        clinicalStatus: { coding: [{ code: "active" }] },
        code: { text: "Penicillin" },
      } as never,
    },
    {
      fullUrl: "urn:uuid:proc-1",
      resource: {
        resourceType: "Procedure",
        id: "proc-1",
        status: "completed",
        code: { text: "Blood draw" },
        performedDateTime: "2024-03-15",
        subject: { reference: "urn:uuid:p1" },
        encounter: { reference: "urn:uuid:enc-1" },
        reasonReference: [{ reference: "urn:uuid:cond-active" }],
      } as never,
    },
  ],
};

describe("bundleToEvents", () => {
  const events = bundleToEvents(syntheticBundle);

  it("maps Condition to Problems lane", () => {
    const condEvents = events.filter((e) => e.sourceType === "Condition");
    expect(condEvents).toHaveLength(2);
    expect(condEvents.every((e) => e.lane === "Problems")).toBe(true);
  });

  it("maps MedicationRequest to Medications lane", () => {
    const medEvents = events.filter((e) => e.sourceType === "MedicationRequest");
    expect(medEvents).toHaveLength(1);
    expect(medEvents[0].lane).toBe("Medications");
  });

  it("maps Procedure to Procedures lane", () => {
    const procEvents = events.filter((e) => e.sourceType === "Procedure");
    expect(procEvents).toHaveLength(1);
    expect(procEvents[0].lane).toBe("Procedures");
  });

  it("maps Encounter to Visits lane", () => {
    const encEvents = events.filter((e) => e.sourceType === "Encounter");
    expect(encEvents).toHaveLength(1);
    expect(encEvents[0].lane).toBe("Visits");
  });

  it("maps Observation to Labs lane", () => {
    const obsEvents = events.filter((e) => e.sourceType === "Observation");
    expect(obsEvents).toHaveLength(1);
    expect(obsEvents[0].lane).toBe("Labs");
  });

  it("maps Immunization to Immunizations lane", () => {
    const immEvents = events.filter((e) => e.sourceType === "Immunization");
    expect(immEvents).toHaveLength(1);
    expect(immEvents[0].lane).toBe("Immunizations");
  });

  it("excludes AllergyIntolerance from events", () => {
    const allergyEvents = events.filter((e) => e.sourceType === "AllergyIntolerance");
    expect(allergyEvents).toHaveLength(0);
  });

  it("produces end: null for an active chronic condition (open-ended)", () => {
    const active = events.find((e) => e.id === "cond-active");
    expect(active).toBeDefined();
    expect(active!.end).toBeNull();
  });

  it("produces a defined end for a resolved condition", () => {
    const resolved = events.find((e) => e.id === "cond-resolved");
    expect(resolved).toBeDefined();
    expect(resolved!.end).not.toBeNull();
    expect(resolved!.end!.iso).toBe("2023-06-24");
  });

  it("infers year precision for a year-only onset date", () => {
    const active = events.find((e) => e.id === "cond-active");
    expect(active!.start.precision).toBe("year");
  });

  it("extracts labels from code.text or coding.display", () => {
    const active = events.find((e) => e.id === "cond-active");
    expect(active!.label).toBe("Type 2 Diabetes");

    const med = events.find((e) => e.id === "med-1");
    expect(med!.label).toBe("Metformin 500mg");
  });
});

describe("bidirectional refs", () => {
  const events = bundleToEvents(syntheticBundle);

  it("links MedicationRequest to its reasonReference Condition", () => {
    const med = events.find((e) => e.id === "med-1");
    const cond = events.find((e) => e.id === "cond-active");
    expect(med!.refs).toContain("cond-active");
    expect(cond!.refs).toContain("med-1");
  });

  it("links Procedure to its reasonReference Condition", () => {
    const proc = events.find((e) => e.id === "proc-1");
    const cond = events.find((e) => e.id === "cond-active");
    expect(proc!.refs).toContain("cond-active");
    expect(cond!.refs).toContain("proc-1");
  });

  it("links resources to their Encounter via encounter reference", () => {
    const med = events.find((e) => e.id === "med-1");
    const enc = events.find((e) => e.id === "enc-1");
    expect(med!.refs).toContain("enc-1");
    expect(enc!.refs).toContain("med-1");
  });
});

describe("salience", () => {
  const events = bundleToEvents(syntheticBundle);

  it("assigns higher salience to active conditions than resolved ones", () => {
    const active = events.find((e) => e.id === "cond-active");
    const resolved = events.find((e) => e.id === "cond-resolved");
    expect(active!.salience).toBeGreaterThan(resolved!.salience);
  });

  it("assigns higher salience to abnormal observations", () => {
    const abnormalObs = events.find((e) => e.id === "obs-abnormal");
    const imm = events.find((e) => e.id === "imm-1");
    expect(abnormalObs!.salience).toBeGreaterThan(imm!.salience);
  });

  it("gives a ref bonus to events with multiple references", () => {
    const condActive = events.find((e) => e.id === "cond-active");
    expect(condActive!.refs.length).toBeGreaterThanOrEqual(2);
    expect(condActive!.salience).toBeGreaterThan(0.5);
  });

  it("keeps all salience values in [0, 1]", () => {
    for (const event of events) {
      expect(event.salience).toBeGreaterThanOrEqual(0);
      expect(event.salience).toBeLessThanOrEqual(1);
    }
  });

  it("logs salience values for verification", () => {
    const salienceTable = events
      .sort((a, b) => b.salience - a.salience)
      .map((e) => ({ id: e.id, label: e.label, status: e.status, refs: e.refs.length, salience: e.salience.toFixed(3) }));
    console.table(salienceTable);
  });
});

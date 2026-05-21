// Unit tests for normalizeBundle: ensures exactly one Patient in a FHIR bundle.

import { describe, it, expect } from "vitest";
import { normalizeBundle } from "@/lib/phenoml/normalizeBundle";
import type { Bundle, Patient, Condition } from "@/types/fhir";

function makeBundle(entries: Bundle["entry"] = []): Bundle {
  return { resourceType: "Bundle", type: "transaction", entry: entries };
}

function patientEntry(id: string): NonNullable<Bundle["entry"]>[number] {
  const resource: Patient = { resourceType: "Patient", id, name: [{ text: `Patient ${id}` }] };
  return { fullUrl: `urn:uuid:${id}`, resource, request: { method: "POST", url: "Patient" } };
}

function conditionEntry(patientRef: string): NonNullable<Bundle["entry"]>[number] {
  const resource: Condition = {
    resourceType: "Condition",
    id: "cond-1",
    subject: { reference: patientRef },
  };
  return { fullUrl: "urn:uuid:cond-1", resource, request: { method: "POST", url: "Condition" } };
}

describe("normalizeBundle", () => {
  it("returns the bundle unchanged when it has exactly one Patient", () => {
    const bundle = makeBundle([patientEntry("p1"), conditionEntry("Patient/p1")]);
    const result = normalizeBundle(bundle);
    expect(result).toBe(bundle);
  });

  it("synthesizes a Patient when none exist", () => {
    const bundle = makeBundle([conditionEntry("Patient/unknown")]);
    const result = normalizeBundle(bundle);

    const patients = result.entry!.filter(
      (e) => (e.resource as { resourceType: string }).resourceType === "Patient",
    );
    expect(patients).toHaveLength(1);
    expect((patients[0].resource as { id: string }).id).toBe("patient-synthesized");
  });

  it("re-points references to the synthesized Patient", () => {
    const bundle = makeBundle([conditionEntry("Patient/old-ref")]);
    const result = normalizeBundle(bundle);

    const condition = result.entry!.find(
      (e) => (e.resource as { resourceType: string }).resourceType === "Condition",
    );
    const subject = (condition!.resource as { subject: { reference: string } }).subject;
    expect(subject.reference).toBe("Patient/patient-synthesized");
  });

  it("keeps the first Patient and removes extras when multiple exist", () => {
    const bundle = makeBundle([
      patientEntry("p1"),
      patientEntry("p2"),
      conditionEntry("Patient/p2"),
    ]);
    const result = normalizeBundle(bundle);

    const patients = result.entry!.filter(
      (e) => (e.resource as { resourceType: string }).resourceType === "Patient",
    );
    expect(patients).toHaveLength(1);
    expect((patients[0].resource as { id: string }).id).toBe("p1");
  });

  it("re-points references to the primary Patient when extras are removed", () => {
    const bundle = makeBundle([
      patientEntry("p1"),
      patientEntry("p2"),
      conditionEntry("Patient/p2"),
    ]);
    const result = normalizeBundle(bundle);

    const condition = result.entry!.find(
      (e) => (e.resource as { resourceType: string }).resourceType === "Condition",
    );
    const subject = (condition!.resource as { subject: { reference: string } }).subject;
    expect(subject.reference).toBe("Patient/p1");
  });

  it("handles an empty entry array", () => {
    const bundle = makeBundle();
    const result = normalizeBundle(bundle);

    const patients = result.entry!.filter(
      (e) => (e.resource as { resourceType: string }).resourceType === "Patient",
    );
    expect(patients).toHaveLength(1);
  });
});

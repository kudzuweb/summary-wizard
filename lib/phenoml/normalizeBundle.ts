// Ensures a FHIR transaction Bundle contains exactly one Patient resource.
// The IPS summary endpoint requires a single Patient; this helper handles
// bundles with zero or multiple Patients from the extraction API.

import type { Bundle, Patient, BundleEntry } from "@/types/fhir";

type FhirResource = { resourceType: string; [key: string]: unknown };

const PLACEHOLDER_PATIENT_ID = "patient-synthesized";

function isPatient(entry: BundleEntry): boolean {
  return (entry.resource as FhirResource | undefined)?.resourceType === "Patient";
}

function synthesizePatient(): Patient {
  return {
    resourceType: "Patient",
    id: PLACEHOLDER_PATIENT_ID,
    name: [{ text: "Unknown Patient" }],
  };
}

function rePointReferences(bundle: Bundle, patientId: string): void {
  const ref = `Patient/${patientId}`;
  for (const entry of bundle.entry ?? []) {
    const resource = entry.resource as Record<string, unknown> | undefined;
    if (!resource || resource.resourceType === "Patient") continue;

    for (const field of ["subject", "patient"]) {
      const value = resource[field] as
        | { reference?: string }
        | undefined;
      if (value?.reference?.startsWith("Patient/")) {
        value.reference = ref;
      }
    }
  }
}

export function normalizeBundle(bundle: Bundle): Bundle {
  const entries = bundle.entry ?? [];
  const patientEntries = entries.filter(isPatient);

  if (patientEntries.length === 1) {
    return bundle;
  }

  const normalized: Bundle = { ...bundle, entry: [...entries] };

  if (patientEntries.length === 0) {
    const patient = synthesizePatient();
    normalized.entry!.unshift({
      fullUrl: `urn:uuid:${PLACEHOLDER_PATIENT_ID}`,
      resource: patient,
      request: { method: "POST", url: "Patient" },
    });
    rePointReferences(normalized, PLACEHOLDER_PATIENT_ID);
    return normalized;
  }

  const primary = patientEntries[0];
  const primaryId =
    (primary.resource as Patient).id ?? PLACEHOLDER_PATIENT_ID;
  normalized.entry = entries.filter(
    (e) => !isPatient(e) || e === primary,
  );
  rePointReferences(normalized, primaryId);

  return normalized;
}

// Request/response contracts for each proxy route. Routes and their callers
// share these as a single source of truth.

import type { Bundle } from "./fhir";
import type { SummarySection } from "./summary";

// POST /api/ingest — multipart file in
export type IngestResponse = Bundle | { error: string };

// POST /api/summary
export type SummaryRequest = { bundle: Bundle };
export type SummaryResponse = { sections: SummarySection[] } | { error: string };

// POST /api/query
export type QueryRequest = { question: string };
export type QueryResponse =
  | { resourceType: string; searchParams: string }
  | { error: string };

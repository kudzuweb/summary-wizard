// Public interface for the server-side PhenoML wrapper.
// Nothing outside lib/phenoml/ imports the raw SDK; the rest of the app depends
// only on this interface.

import type { Bundle } from "./fhir";
import type { SummarySection } from "./summary";

export interface PhenoMLClient {
  documentMulti(file: {
    bytes: Buffer;
    filename: string;
    mimeType: string;
  }): Promise<Bundle>;

  summarizeIps(bundle: Bundle): Promise<{
    sections: SummarySection[];
    raw: unknown;
  }>;

  generateSearch(question: string): Promise<{
    resourceType: string;
    searchParams: string;
  }>;
}

// Server-side PhenoML wrapper. Implements the PhenoMLClient interface from
// types/phenoml.ts, keeping the raw SDK contained to this module.

import { phenomlClient } from "phenoml";
import type { Bundle } from "@/types/fhir";
import type { SummarySection } from "@/types/summary";
import type { PhenoMLClient } from "@/types/phenoml";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const sdk = new phenomlClient({
  clientId: requireEnv("PHENOML_CLIENT_ID"),
  clientSecret: requireEnv("PHENOML_CLIENT_SECRET"),
  baseUrl: requireEnv("PHENOML_API_BASE"),
  timeoutInSeconds: 210,
});

function parseSummarySections(narrative: string): SummarySection[] {
  const lines = narrative.split("\n");
  const sections: SummarySection[] = [];
  let currentTitle = "";
  let currentLines: string[] = [];

  for (const line of lines) {
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      if (currentTitle) {
        sections.push({
          title: currentTitle,
          content: currentLines.join("\n").trim(),
        });
      }
      currentTitle = heading[1].trim();
      currentLines = [];
    } else if (currentTitle) {
      currentLines.push(line);
    }
  }

  if (currentTitle) {
    sections.push({
      title: currentTitle,
      content: currentLines.join("\n").trim(),
    });
  }

  return sections;
}

export const phenoml: PhenoMLClient = {
  async documentMulti(file) {
    const base64 = file.bytes.toString("base64");

    const response = await sdk.lang2Fhir.extractMultipleFhirResourcesFromADocument({
      version: "R4",
      content: base64,
      detection_effort: "deep",
    });

    if (!response.bundle) {
      throw new PhenoMLError(
        "documentMulti returned no bundle",
        undefined,
        response,
      );
    }

    return response.bundle as unknown as Bundle;
  },

  async summarizeIps(bundle) {
    const response = await sdk.summary.create({
      mode: "ips",
      fhir_resources: bundle as unknown as Record<string, unknown>,
    });

    if (!response.success || !response.summary) {
      throw new PhenoMLError(
        response.message ?? "summarizeIps failed",
        undefined,
        response,
      );
    }

    return {
      sections: parseSummarySections(response.summary),
      raw: response,
    };
  },

  async generateSearch(question) {
    const response = await sdk.lang2Fhir.search({ text: question });

    if (!response.resource_type || response.search_params === undefined) {
      throw new PhenoMLError(
        "search returned incomplete result",
        undefined,
        response,
      );
    }

    return {
      resourceType: response.resource_type,
      searchParams: response.search_params,
    };
  },
};

export class PhenoMLError extends Error {
  readonly statusCode: number | undefined;
  readonly body: unknown;

  constructor(message: string, statusCode?: number, body?: unknown) {
    super(message);
    this.name = "PhenoMLError";
    this.statusCode = statusCode;
    this.body = body;
  }
}

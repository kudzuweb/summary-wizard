// POST handler for IPS summary generation. Accepts a FHIR bundle,
// forwards to PhenoML for IPS summarization, and returns parsed sections.

import { NextRequest, NextResponse } from "next/server";
import { phenoml, PhenoMLError } from "@/lib/phenoml/client";
import type { Bundle } from "@/types/fhir";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  if (!body || !body.bundle) {
    return NextResponse.json(
      { error: "Request body must include a 'bundle' field" },
      { status: 400 },
    );
  }

  try {
    const result = await phenoml.summarizeIps(body.bundle as Bundle);
    return NextResponse.json({ sections: result.sections });
  } catch (err) {
    const statusCode = err instanceof PhenoMLError ? (err.statusCode ?? 502) : 500;
    const message = err instanceof Error ? err.message : "Unexpected summarization error";
    return NextResponse.json({ error: message }, { status: statusCode });
  }
}

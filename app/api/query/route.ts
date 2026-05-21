// POST handler for natural-language → FHIR search param translation.
// Accepts { question }, forwards to PhenoML, returns { resourceType, searchParams }.

import { NextRequest, NextResponse } from "next/server";
import { phenoml, PhenoMLError } from "@/lib/phenoml/client";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body?.question || typeof body.question !== "string") {
    return NextResponse.json(
      { error: "Missing required 'question' field" },
      { status: 400 },
    );
  }

  try {
    const result = await phenoml.generateSearch(body.question);
    return NextResponse.json(result);
  } catch (err) {
    const statusCode = err instanceof PhenoMLError ? (err.statusCode ?? 502) : 500;
    const message = err instanceof Error ? err.message : "Unexpected query error";
    return NextResponse.json({ error: message }, { status: statusCode });
  }
}

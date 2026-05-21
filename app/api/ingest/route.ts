// POST handler for PDF/image ingestion. Accepts a multipart file upload,
// validates it, forwards to PhenoML for FHIR extraction, normalizes the
// bundle to have exactly one Patient, and returns it.

import { NextRequest, NextResponse } from "next/server";
import { phenoml, PhenoMLError } from "@/lib/phenoml/client";
import { normalizeBundle } from "@/lib/phenoml/normalizeBundle";

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB

const ACCEPTED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/tiff",
]);

export async function POST(request: NextRequest) {
  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "Request must be multipart/form-data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing required 'file' field" }, { status: 400 });
  }

  if (!ACCEPTED_MIME_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: `Unsupported file type: ${file.type}. Accepted: PDF, JPEG, PNG, TIFF.` },
      { status: 400 },
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File exceeds ${MAX_FILE_SIZE / 1024 / 1024} MB limit` },
      { status: 400 },
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  try {
    const rawBundle = await phenoml.documentMulti({
      bytes,
      filename: file.name,
      mimeType: file.type,
    });

    const bundle = normalizeBundle(rawBundle);
    return NextResponse.json(bundle);
  } catch (err) {
    const statusCode = err instanceof PhenoMLError ? (err.statusCode ?? 502) : 500;
    const message = err instanceof Error ? err.message : "Unexpected extraction error";
    return NextResponse.json({ error: message }, { status: statusCode });
  }
}

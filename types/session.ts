// Storage and store shapes for the ephemeral client-side session.

import type { Bundle } from "./fhir";
import type { SummarySection } from "./summary";

export type SessionRecord = {
  id: "current";
  bundle: Bundle;
  createdAt: number;
  expiresAt: number;
};

export type SessionStatus = "empty" | "loading" | "ready" | "expired" | "error";

export type SessionState = {
  bundle: Bundle | null;
  status: SessionStatus;
  summary?: SummarySection[];
  error?: string;
};

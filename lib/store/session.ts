// Zustand store for the client-side session. Holds the FHIR bundle, status,
// optional summary, and error. Actions manage the lifecycle: ingest a new
// bundle, hydrate from IndexedDB on mount, and reset to start over.

import { create } from "zustand";
import type { Bundle } from "@/types/fhir";
import type { SummarySection } from "@/types/summary";
import type { SessionStatus } from "@/types/session";
import { saveSession, loadSession, clearSession } from "@/lib/storage/db";

interface SessionStore {
  bundle: Bundle | null;
  status: SessionStatus;
  summary: SummarySection[] | undefined;
  error: string | undefined;
  expiresAt: number | null;

  ingestFromBundle: (bundle: Bundle) => Promise<void>;
  hydrateFromStorage: () => Promise<void>;
  setSummary: (sections: SummarySection[]) => void;
  setError: (message: string) => void;
  setStatus: (status: SessionStatus) => void;
  reset: () => Promise<void>;
}

export const useSessionStore = create<SessionStore>((set) => ({
  bundle: null,
  status: "empty",
  summary: undefined,
  error: undefined,
  expiresAt: null,

  async ingestFromBundle(bundle: Bundle) {
    const record = await saveSession(bundle);
    set({
      bundle,
      status: "ready",
      error: undefined,
      expiresAt: record.expiresAt,
    });
  },

  async hydrateFromStorage() {
    const record = await loadSession();
    if (record) {
      set({
        bundle: record.bundle,
        status: "ready",
        expiresAt: record.expiresAt,
      });
    } else {
      set({ bundle: null, status: "empty", expiresAt: null });
    }
  },

  setSummary(sections: SummarySection[]) {
    set({ summary: sections });
  },

  setError(message: string) {
    set({ status: "error", error: message });
  },

  setStatus(status: SessionStatus) {
    set({ status });
  },

  async reset() {
    await clearSession();
    set({
      bundle: null,
      status: "empty",
      summary: undefined,
      error: undefined,
      expiresAt: null,
    });
  },
}));

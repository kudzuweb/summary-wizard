// IndexedDB persistence layer for the ephemeral session record.
// Uses `idb` for a typed wrapper around IndexedDB. The single "current"
// record holds the FHIR bundle with an 8-hour TTL; loadSession purges
// expired records on read.

import { openDB, type DBSchema } from "idb";
import type { Bundle } from "@/types/fhir";
import type { SessionRecord } from "@/types/session";

const DB_NAME = "mr-summarizer";
const DB_VERSION = 1;
const STORE_NAME = "session" as const;
const TTL_MS = 8 * 60 * 60 * 1000;

interface SummarizerDB extends DBSchema {
  session: {
    key: "current";
    value: SessionRecord;
  };
}

function getDb() {
  return openDB<SummarizerDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore(STORE_NAME, { keyPath: "id" });
    },
  });
}

export async function saveSession(bundle: Bundle): Promise<SessionRecord> {
  const now = Date.now();
  const record: SessionRecord = {
    id: "current",
    bundle,
    createdAt: now,
    expiresAt: now + TTL_MS,
  };
  const db = await getDb();
  await db.put(STORE_NAME, record);
  return record;
}

export async function loadSession(): Promise<SessionRecord | null> {
  const db = await getDb();
  const record = await db.get(STORE_NAME, "current");
  if (!record) return null;

  if (Date.now() >= record.expiresAt) {
    await clearSession();
    return null;
  }

  return record;
}

export async function clearSession(): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_NAME, "current");
}

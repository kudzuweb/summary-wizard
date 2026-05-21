// Tests for the IndexedDB session persistence layer: save, load, clear,
// and TTL expiry behavior.

import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { saveSession, loadSession, clearSession } from "@/lib/storage/db";
import type { Bundle } from "@/types/fhir";

const testBundle: Bundle = {
  resourceType: "Bundle",
  type: "transaction",
  entry: [],
};

beforeEach(async () => {
  await clearSession().catch(() => {});
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("session persistence", () => {
  it("saves and loads a bundle", async () => {
    await saveSession(testBundle);
    const record = await loadSession();
    expect(record).not.toBeNull();
    expect(record!.bundle.resourceType).toBe("Bundle");
    expect(record!.id).toBe("current");
  });

  it("returns null when no session exists", async () => {
    const record = await loadSession();
    expect(record).toBeNull();
  });

  it("clears the session", async () => {
    await saveSession(testBundle);
    await clearSession();
    const record = await loadSession();
    expect(record).toBeNull();
  });
});

describe("TTL expiry", () => {
  it("returns the bundle when not yet expired", async () => {
    await saveSession(testBundle);
    const record = await loadSession();
    expect(record).not.toBeNull();
    expect(record!.expiresAt).toBeGreaterThan(Date.now());
  });

  it("returns null and clears the store when expired", async () => {
    await saveSession(testBundle);

    const eightHoursLater = Date.now() + 8 * 60 * 60 * 1000 + 1000;
    vi.spyOn(Date, "now").mockReturnValue(eightHoursLater);

    const record = await loadSession();
    expect(record).toBeNull();

    vi.restoreAllMocks();
    const afterClear = await loadSession();
    expect(afterClear).toBeNull();
  });

  it("sets expiresAt to createdAt + 8 hours", async () => {
    const before = Date.now();
    const record = await saveSession(testBundle);
    const after = Date.now();

    const expectedTtl = 8 * 60 * 60 * 1000;
    expect(record.expiresAt).toBeGreaterThanOrEqual(before + expectedTtl);
    expect(record.expiresAt).toBeLessThanOrEqual(after + expectedTtl);
  });
});

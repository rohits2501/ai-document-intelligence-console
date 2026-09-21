import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { JOB_SCHEMA_VERSION, databasePath, openJobDatabase } from "./db";
import { StoreOpenError } from "./store-errors";

function resetDbSlot() {
  const g = globalThis as unknown as {
    __docIntelDb?: { db: { open: boolean; close: () => void } };
  };
  if (g.__docIntelDb?.db.open) g.__docIntelDb.db.close();
  delete g.__docIntelDb;
}

afterEach(() => {
  resetDbSlot();
  delete process.env.DATA_DIR;
});

describe("openJobDatabase (AC-1, AC-7)", () => {
  it("creates the schema and records user_version", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "doc-intel-db-"));
    process.env.DATA_DIR = dir;
    resetDbSlot();
    const db = openJobDatabase();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as { name: string }[];
    expect(tables.map((t) => t.name)).toEqual(
      expect.arrayContaining(["documents", "jobs", "job_events", "reviews"]),
    );
    expect(Number(db.pragma("user_version", { simple: true }))).toBe(JOB_SCHEMA_VERSION);
    expect(databasePath()).toBe(path.join(dir, "doc-intel.db"));
  });

  it("throws StoreOpenError when the database path cannot be opened", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "doc-intel-bad-"));
    mkdirSync(path.join(dir, "doc-intel.db"));
    process.env.DATA_DIR = dir;
    resetDbSlot();
    expect(() => openJobDatabase()).toThrow(StoreOpenError);
  });
});

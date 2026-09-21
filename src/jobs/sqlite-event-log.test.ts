import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openJobDatabase } from "./db";
import { SqliteEventLog } from "./sqlite-event-log";
import { SqliteDocumentStore, SqliteJobStore } from "./sqlite-store";
import { StoreDataError } from "./store-errors";

function resetDbSlot() {
  const g = globalThis as unknown as {
    __docIntelDb?: { db: { open: boolean; close: () => void } };
  };
  if (g.__docIntelDb?.db.open) g.__docIntelDb.db.close();
  delete g.__docIntelDb;
}

function openStores() {
  const dir = mkdtempSync(path.join(tmpdir(), "doc-intel-elog-"));
  process.env.DATA_DIR = dir;
  resetDbSlot();
  const db = openJobDatabase();
  const documents = new SqliteDocumentStore(db);
  const jobs = new SqliteJobStore(db);
  documents.put({
    id: "doc_1",
    name: "a.pdf",
    sizeBytes: 1,
    pageCount: null,
    storageKey: "k",
    createdAt: new Date().toISOString(),
  });
  const job = jobs.create("doc_1", "extract");
  return { db, jobs, events: new SqliteEventLog(db), job };
}

afterEach(() => {
  resetDbSlot();
  delete process.env.DATA_DIR;
});

describe("SqliteEventLog (AC-2, AC-3, AC-9)", () => {
  it("assigns contiguous 1-based ids and keeps last_event_id in the same write", () => {
    const { db, jobs, events, job } = openStores();
    events.append(job.id, "queued", { message: "first" });
    events.append(job.id, "processing", {});
    events.append(job.id, "cancelled", { message: "cancelled by operator" });
    const ids = events.since(job.id, 0).map((e) => e.id);
    expect(ids).toEqual([1, 2, 3]);
    const row = db
      .prepare<
        { id: string },
        { last_event_id: number; status: string }
      >("SELECT last_event_id, status FROM jobs WHERE id = @id")
      .get({ id: job.id });
    expect(row?.last_event_id).toBe(3);
    expect(row?.status).toBe("failed");
    expect(jobs.get(job.id)?.lastEventId).toBe(3);
  });

  it("replays from Last-Event-ID without gaps or duplicates", () => {
    const { events, job } = openStores();
    for (let i = 0; i < 5; i++) events.append(job.id, "page_processed", { page: i + 1 });
    expect(events.since(job.id, 3).map((e) => e.id)).toEqual([4, 5]);
  });

  it("survives a process restart of the connection (AC-2)", () => {
    const { events, job } = openStores();
    events.append(job.id, "queued", {});
    events.append(job.id, "processing", {});
    resetDbSlot();
    const db = openJobDatabase();
    const again = new SqliteEventLog(db);
    expect(again.since(job.id, 0).map((e) => e.type)).toEqual(["queued", "processing"]);
  });

  it("stamps attempt on queued events so a retry is distinguishable (AC-9)", () => {
    const { events, job } = openStores();
    const first = events.append(job.id, "queued", { message: "first" });
    events.append(job.id, "failed", { error: "boom" });
    const retry = events.append(job.id, "queued", { message: "retry" });
    expect(first.data.attempt).toBe(1);
    expect(retry.data.attempt).toBe(2);
    expect(events.since(job.id, 0).map((e) => e.type)).toEqual(["queued", "failed", "queued"]);
  });

  it("notifies subscribers only after the write commits", () => {
    const { events, job } = openStores();
    const seen: number[] = [];
    events.subscribe(job.id, (e) => seen.push(e.id));
    events.append(job.id, "queued", {});
    expect(seen).toEqual([1]);
  });

  it("fails the read when event data is not valid JSON", () => {
    const { db, events, job } = openStores();
    events.append(job.id, "queued", {});
    db.prepare("UPDATE job_events SET data = 'NOT_JSON' WHERE job_id = ? AND id = 1").run(job.id);
    expect(() => events.since(job.id, 0)).toThrow(StoreDataError);
  });
});

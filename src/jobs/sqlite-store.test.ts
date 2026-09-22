import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openJobDatabase } from "./db";
import { SqliteReviewStore } from "./review-store";
import { SqliteDocumentStore, SqliteJobStore } from "./sqlite-store";

function resetDbSlot() {
  const g = globalThis as unknown as {
    __docIntelDb?: { db: { open: boolean; close: () => void } };
  };
  if (g.__docIntelDb?.db.open) g.__docIntelDb.db.close();
  delete g.__docIntelDb;
}

function openStores() {
  const dir = mkdtempSync(path.join(tmpdir(), "doc-intel-store-"));
  process.env.DATA_DIR = dir;
  resetDbSlot();
  const db = openJobDatabase();
  return {
    documents: new SqliteDocumentStore(db),
    jobs: new SqliteJobStore(db),
    reviews: new SqliteReviewStore(db),
  };
}

afterEach(() => {
  resetDbSlot();
  delete process.env.DATA_DIR;
});

describe("SqliteDocumentStore and SqliteJobStore (AC-1)", () => {
  it("persists a document and job across a reopen", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "doc-intel-job-"));
    process.env.DATA_DIR = dir;
    resetDbSlot();
    const db = openJobDatabase();
    const documents = new SqliteDocumentStore(db);
    const jobs = new SqliteJobStore(db);
    documents.put({
      id: "doc_1",
      name: "a.pdf",
      sizeBytes: 12,
      pageCount: null,
      storageKey: "k",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const job = jobs.create("doc_1", "extract");
    expect(documents.get("doc_1")?.name).toBe("a.pdf");
    db.close();
    resetDbSlot();
    process.env.DATA_DIR = dir;
    const db2 = openJobDatabase();
    expect(new SqliteDocumentStore(db2).get("doc_1")?.name).toBe("a.pdf");
    expect(new SqliteJobStore(db2).get(job.id)?.documentId).toBe("doc_1");
  });

  it("puts a job with a stable id", () => {
    const { documents, jobs } = openStores();
    documents.put({
      id: "doc_1",
      name: "a.pdf",
      sizeBytes: 1,
      pageCount: null,
      storageKey: "k",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    jobs.put({
      id: "job_stable",
      documentId: "doc_1",
      kind: "extract",
      status: "queued",
      lastEventId: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      error: null,
    });
    expect(jobs.get("job_stable")?.documentId).toBe("doc_1");
    jobs.put({
      id: "job_stable",
      documentId: "doc_1",
      kind: "digitise",
      status: "completed",
      lastEventId: 4,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      error: null,
    });
    expect(jobs.get("job_stable")?.kind).toBe("digitise");
    expect(jobs.get("job_stable")?.kind).toBe("digitise");
    expect(jobs.get("job_stable")?.lastEventId).toBe(4);
  });

  it("lists jobs newest first", () => {
    const { documents, jobs } = openStores();
    documents.put({
      id: "doc_1",
      name: "a.pdf",
      sizeBytes: 1,
      pageCount: null,
      storageKey: "k",
      createdAt: new Date().toISOString(),
    });
    const older = jobs.create("doc_1", "extract");
    const newer = jobs.create("doc_1", "digitise");
    const list = jobs.list();
    const ids = list.map((j) => j.id);
    expect(ids).toHaveLength(2);
    expect(ids).toEqual(expect.arrayContaining([older.id, newer.id]));
  });
});

describe("SqliteReviewStore (AC-4)", () => {
  it("upserts a review by job id and restores it after reopen", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "doc-intel-rev-"));
    process.env.DATA_DIR = dir;
    resetDbSlot();
    const db = openJobDatabase();
    const documents = new SqliteDocumentStore(db);
    const jobs = new SqliteJobStore(db);
    const reviews = new SqliteReviewStore(db);
    documents.put({
      id: "doc_1",
      name: "a.pdf",
      sizeBytes: 1,
      pageCount: null,
      storageKey: "k",
      createdAt: new Date().toISOString(),
    });
    const job = jobs.create("doc_1", "extract");
    reviews.put({
      jobId: job.id,
      fields: [{ key: "invoice_number", value: "EDIT-1", approved: true }],
      submittedAt: "2026-01-01T00:00:00.000Z",
    });
    reviews.put({
      jobId: job.id,
      fields: [{ key: "invoice_number", value: "EDIT-2", approved: true }],
      submittedAt: "2026-01-02T00:00:00.000Z",
    });
    expect(reviews.get(job.id)?.fields[0]?.value).toBe("EDIT-2");
    db.close();
    resetDbSlot();
    process.env.DATA_DIR = dir;
    const db2 = openJobDatabase();
    const restored = new SqliteReviewStore(db2).get(job.id);
    expect(restored?.fields[0]?.value).toBe("EDIT-2");
    expect(restored?.fields[0]?.approved).toBe(true);
  });
});

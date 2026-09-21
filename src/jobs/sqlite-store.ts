import type Database from "better-sqlite3";
import type { DocumentRecord, Job, JobKind } from "./types";
import { DocumentRecord as DocumentRecordSchema, Job as JobSchema } from "./types";
import type { DocumentStore, JobStore } from "./store";
import { StoreDataError } from "./store-errors";

interface DocumentRow {
  id: string;
  name: string;
  size_bytes: number;
  page_count: number | null;
  storage_key: string;
  created_at: string;
}

interface JobRow {
  id: string;
  document_id: string;
  kind: string;
  status: string;
  last_event_id: number;
  created_at: string;
  updated_at: string;
  error: string | null;
}

function mapDocument(row: DocumentRow): DocumentRecord {
  const parsed = DocumentRecordSchema.safeParse({
    id: row.id,
    name: row.name,
    sizeBytes: row.size_bytes,
    pageCount: row.page_count,
    storageKey: row.storage_key,
    createdAt: row.created_at,
  });
  if (!parsed.success) {
    throw new StoreDataError("corrupt document row", { document_id: row.id });
  }
  return parsed.data;
}

function mapJob(row: JobRow): Job {
  const parsed = JobSchema.safeParse({
    id: row.id,
    documentId: row.document_id,
    kind: row.kind,
    status: row.status,
    lastEventId: row.last_event_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    error: row.error,
  });
  if (!parsed.success) {
    throw new StoreDataError("corrupt job row", { job_id: row.id });
  }
  return parsed.data;
}

export class SqliteDocumentStore implements DocumentStore {
  constructor(private readonly db: Database.Database) {}

  put(doc: DocumentRecord): void {
    this.db
      .prepare(
        `INSERT INTO documents (id, name, size_bytes, page_count, storage_key, created_at)
         VALUES (@id, @name, @sizeBytes, @pageCount, @storageKey, @createdAt)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           size_bytes = excluded.size_bytes,
           page_count = excluded.page_count,
           storage_key = excluded.storage_key`,
      )
      .run({
        id: doc.id,
        name: doc.name,
        sizeBytes: doc.sizeBytes,
        pageCount: doc.pageCount,
        storageKey: doc.storageKey,
        createdAt: doc.createdAt,
      });
  }

  get(id: string): DocumentRecord | undefined {
    const row = this.db
      .prepare<
        { id: string },
        DocumentRow
      >(`SELECT id, name, size_bytes, page_count, storage_key, created_at FROM documents WHERE id = @id`)
      .get({ id });
    return row ? mapDocument(row) : undefined;
  }
}

export class SqliteJobStore implements JobStore {
  constructor(private readonly db: Database.Database) {}

  create(documentId: string, kind: JobKind): Job {
    const now = new Date().toISOString();
    const job: Job = {
      id: `job_${crypto.randomUUID()}`,
      documentId,
      kind,
      status: "queued",
      lastEventId: 0,
      createdAt: now,
      updatedAt: now,
      error: null,
    };
    this.db
      .prepare(
        `INSERT INTO jobs (id, document_id, kind, status, last_event_id, created_at, updated_at, error)
         VALUES (@id, @documentId, @kind, @status, @lastEventId, @createdAt, @updatedAt, @error)`,
      )
      .run(job);
    return job;
  }

  get(id: string): Job | undefined {
    const row = this.db
      .prepare<{ id: string }, JobRow>(`SELECT * FROM jobs WHERE id = @id`)
      .get({ id });
    return row ? mapJob(row) : undefined;
  }

  update(id: string, patch: Partial<Job>): Job | undefined {
    const current = this.get(id);
    if (!current) return undefined;
    const next: Job = { ...current, ...patch, updatedAt: new Date().toISOString() };
    this.db
      .prepare(
        `UPDATE jobs SET
           document_id = @documentId,
           kind = @kind,
           status = @status,
           last_event_id = @lastEventId,
           created_at = @createdAt,
           updated_at = @updatedAt,
           error = @error
         WHERE id = @id`,
      )
      .run(next);
    return next;
  }

  list(): Job[] {
    const rows = this.db.prepare<[], JobRow>(`SELECT * FROM jobs ORDER BY created_at DESC`).all();
    return rows.map(mapJob);
  }
}

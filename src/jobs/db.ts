import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { resolveDataDir } from "@/data-dir";
import { StoreOpenError } from "./store-errors";

const SCHEMA_VERSION = 1;
const DB_FILENAME = "doc-intel.db";

const MIGRATION_V1 = `
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  page_count INTEGER,
  storage_key TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  last_event_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  error TEXT,
  FOREIGN KEY (document_id) REFERENCES documents(id)
);

CREATE INDEX IF NOT EXISTS idx_jobs_document_id ON jobs(document_id);

CREATE TABLE IF NOT EXISTS job_events (
  job_id TEXT NOT NULL,
  id INTEGER NOT NULL,
  type TEXT NOT NULL,
  ts TEXT NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (job_id, id),
  FOREIGN KEY (job_id) REFERENCES jobs(id)
);

CREATE TABLE IF NOT EXISTS reviews (
  job_id TEXT PRIMARY KEY,
  fields TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  FOREIGN KEY (job_id) REFERENCES jobs(id)
);
`;

type DbSlot = { db: Database.Database; path: string };

const globalForDb = globalThis as unknown as { __docIntelDb?: DbSlot };

export function databasePath(): string {
  return path.join(resolveDataDir(), DB_FILENAME);
}

function applyPragmas(db: Database.Database): void {
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("busy_timeout = 5000");
  db.pragma("foreign_keys = ON");
}

function migrate(db: Database.Database): void {
  const version = Number(db.pragma("user_version", { simple: true }));
  if (version >= SCHEMA_VERSION) return;
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(MIGRATION_V1);
    db.pragma(`user_version = ${SCHEMA_VERSION}`);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

/** Open the process-wide SQLite connection. Throws StoreOpenError; never falls back. */
export function openJobDatabase(): Database.Database {
  const cached = globalForDb.__docIntelDb;
  if (cached?.db.open) return cached.db;

  const dbPath = databasePath();
  try {
    mkdirSync(path.dirname(dbPath), { recursive: true });
    const db = new Database(dbPath);
    try {
      applyPragmas(db);
      migrate(db);
    } catch (err) {
      db.close();
      throw err;
    }
    globalForDb.__docIntelDb = { db, path: dbPath };
    return db;
  } catch (err) {
    if (err instanceof StoreOpenError) throw err;
    throw new StoreOpenError(dbPath, err);
  }
}

export const JOB_SCHEMA_VERSION = SCHEMA_VERSION;

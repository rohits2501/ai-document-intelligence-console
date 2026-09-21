import { InMemoryEventLog, type EventLogStore } from "./event-log";
import {
  InMemoryDocumentStore,
  InMemoryJobStore,
  type DocumentStore,
  type JobStore,
} from "./store";
import { flags } from "@/flags";
import { openJobDatabase } from "./db";
import { SqliteEventLog } from "./sqlite-event-log";
import { SqliteDocumentStore, SqliteJobStore } from "./sqlite-store";
import {
  InMemoryReviewStore,
  SqliteReviewStore,
  type ReviewRecord,
  type ReviewStore,
  type ReviewedField,
} from "./review-store";

export type { ReviewRecord, ReviewedField, ReviewStore };

/**
 * Process-wide singletons. In Next.js dev the module graph reloads on edit, so we stash instances
 * on globalThis to keep jobs/events alive across hot reloads. Durable SQLite is the default;
 * NODE_ENV=test or FEATURE_DURABLE_STORE=false selects the in memory store (spec 0005 AC-6).
 */
interface Runtime {
  jobs: JobStore;
  documents: DocumentStore;
  eventLog: EventLogStore;
  reviews: ReviewStore;
}

const globalForRuntime = globalThis as unknown as { __docIntelRuntime?: Runtime };

function createRuntime(): Runtime {
  if (!flags.durableStore) {
    return {
      jobs: new InMemoryJobStore(),
      documents: new InMemoryDocumentStore(),
      eventLog: new InMemoryEventLog(),
      reviews: new InMemoryReviewStore(),
    };
  }
  const db = openJobDatabase();
  return {
    jobs: new SqliteJobStore(db),
    documents: new SqliteDocumentStore(db),
    eventLog: new SqliteEventLog(db),
    reviews: new SqliteReviewStore(db),
  };
}

function getRuntime(): Runtime {
  if (!globalForRuntime.__docIntelRuntime) {
    globalForRuntime.__docIntelRuntime = createRuntime();
  }
  return globalForRuntime.__docIntelRuntime;
}

export const runtime: Runtime = {
  get jobs() {
    return getRuntime().jobs;
  },
  get documents() {
    return getRuntime().documents;
  },
  get eventLog() {
    return getRuntime().eventLog;
  },
  get reviews() {
    return getRuntime().reviews;
  },
};

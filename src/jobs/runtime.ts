import { InMemoryEventLog, type EventLogStore } from "./event-log";
import {
  InMemoryDocumentStore,
  InMemoryJobStore,
  type DocumentStore,
  type JobStore,
} from "./store";

/**
 * Process-wide singletons. In Next.js dev the module graph reloads on edit, so we stash instances
 * on globalThis to keep jobs/events alive across hot reloads. In production these are plain module
 * singletons. Swap these constructors for SQLite/Redis-backed stores later (spec 0002 AC-9).
 */
export interface ReviewedField {
  key: string;
  value: string;
  approved: boolean;
}
export interface ReviewRecord {
  jobId: string;
  fields: ReviewedField[];
  submittedAt: string;
}

interface Runtime {
  jobs: JobStore;
  documents: DocumentStore;
  eventLog: EventLogStore;
  reviews: Map<string, ReviewRecord>;
}

const globalForRuntime = globalThis as unknown as { __docIntelRuntime?: Runtime };

export const runtime: Runtime =
  globalForRuntime.__docIntelRuntime ??
  (globalForRuntime.__docIntelRuntime = {
    jobs: new InMemoryJobStore(),
    documents: new InMemoryDocumentStore(),
    eventLog: new InMemoryEventLog(),
    reviews: new Map<string, ReviewRecord>(),
  });

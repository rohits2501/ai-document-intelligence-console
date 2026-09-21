import type { DocumentRecord, Job, JobKind, JobStatus } from "./types";

/** Job + document records behind interfaces so the demo store is swappable (spec 0002 AC-9). */
export interface DocumentStore {
  put(doc: DocumentRecord): void;
  get(id: string): DocumentRecord | undefined;
}

export interface JobStore {
  create(documentId: string, kind: JobKind): Job;
  get(id: string): Job | undefined;
  update(id: string, patch: Partial<Job>): Job | undefined;
  list(): Job[];
}

export class InMemoryDocumentStore implements DocumentStore {
  private docs = new Map<string, DocumentRecord>();
  put(doc: DocumentRecord): void {
    this.docs.set(doc.id, doc);
  }
  get(id: string): DocumentRecord | undefined {
    return this.docs.get(id);
  }
}

export class InMemoryJobStore implements JobStore {
  private jobs = new Map<string, Job>();

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
    this.jobs.set(job.id, job);
    return job;
  }

  get(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  update(id: string, patch: Partial<Job>): Job | undefined {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    const next: Job = { ...job, ...patch, updatedAt: new Date().toISOString() };
    this.jobs.set(id, next);
    return next;
  }

  list(): Job[] {
    return [...this.jobs.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }
}

export function setJobStatus(store: JobStore, id: string, status: JobStatus, error?: string): void {
  store.update(id, { status, error: error ?? null });
}

import type { JobEvent, JobEventType, JobEventData } from "./types";

/**
 * Append only, ordered event log. The single source of truth for job state.
 * The SSE connection is a disposable cursor over this log (see spec 0002, AC-3/AC-5).
 *
 * This interface can be backed by SQLite/Redis later without touching callers (AC-9).
 */
export interface EventLogStore {
  append(jobId: string, type: JobEventType, data: JobEventData): JobEvent;
  since(jobId: string, lastEventId: number): JobEvent[];
  latestId(jobId: string): number;
  subscribe(jobId: string, listener: (event: JobEvent) => void): () => void;
}

type Sub = (event: JobEvent) => void;

/** In-memory implementation for the demo. Ordered, gap-free, per-job monotonic ids. */
export class InMemoryEventLog implements EventLogStore {
  private events = new Map<string, JobEvent[]>();
  private subs = new Map<string, Set<Sub>>();

  append(jobId: string, type: JobEventType, data: JobEventData = {}): JobEvent {
    const log = this.events.get(jobId) ?? [];
    const event: JobEvent = {
      id: log.length + 1, // 1-based monotonic per job
      jobId,
      type,
      ts: new Date().toISOString(),
      data,
    };
    log.push(event);
    this.events.set(jobId, log);

    const listeners = this.subs.get(jobId);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(event);
        } catch {
          // a broken listener must never break the append path
        }
      }
    }
    return event;
  }

  since(jobId: string, lastEventId: number): JobEvent[] {
    const log = this.events.get(jobId) ?? [];
    if (lastEventId <= 0) return [...log];
    // events are ordered and 1-based, so slice from lastEventId
    return log.slice(lastEventId);
  }

  latestId(jobId: string): number {
    return this.events.get(jobId)?.length ?? 0;
  }

  subscribe(jobId: string, listener: Sub): () => void {
    const set = this.subs.get(jobId) ?? new Set<Sub>();
    set.add(listener);
    this.subs.set(jobId, set);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.subs.delete(jobId);
    };
  }
}

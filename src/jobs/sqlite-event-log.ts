import type Database from "better-sqlite3";
import type { JobEvent, JobEventData, JobEventType } from "./types";
import { JobEvent as JobEventSchema, statusForEvent } from "./types";
import type { EventLogStore } from "./event-log";
import { StoreDataError } from "./store-errors";

type Sub = (event: JobEvent) => void;

interface EventRow {
  job_id: string;
  id: number;
  type: string;
  ts: string;
  data: string;
}

function parseEventRow(row: EventRow): JobEvent {
  let data: unknown;
  try {
    data = JSON.parse(row.data) as unknown;
  } catch (err) {
    throw new StoreDataError("corrupt event row", { job_id: row.job_id, event_id: row.id }, err);
  }
  const parsed = JobEventSchema.safeParse({
    id: row.id,
    jobId: row.job_id,
    type: row.type,
    ts: row.ts,
    data,
  });
  if (!parsed.success) {
    throw new StoreDataError("corrupt event row", { job_id: row.job_id, event_id: row.id });
  }
  return parsed.data;
}

/**
 * Durable EventLogStore. Appends run under BEGIN IMMEDIATE, assign COALESCE(MAX(id),0)+1 per job,
 * keep jobs.last_event_id/status in the same transaction, and notify listeners only after commit.
 */
export class SqliteEventLog implements EventLogStore {
  private subs = new Map<string, Set<Sub>>();

  constructor(private readonly db: Database.Database) {}

  append(jobId: string, type: JobEventType, data: JobEventData = {}): JobEvent {
    const txn = this.db.transaction(
      (jid: string, eventType: JobEventType, payload: JobEventData) => {
        let dataToWrite = payload;
        if (eventType === "queued" && payload.attempt === undefined) {
          const row = this.db
            .prepare<{ jobId: string }, { next: number }>(
              `SELECT COALESCE(MAX(CAST(json_extract(data, '$.attempt') AS INTEGER)), 0) + 1 AS next
             FROM job_events WHERE job_id = @jobId AND type = 'queued'`,
            )
            .get({ jobId: jid });
          dataToWrite = { ...payload, attempt: row?.next ?? 1 };
        }

        const next = this.db
          .prepare<
            { jobId: string },
            { next: number }
          >(`SELECT COALESCE(MAX(id), 0) + 1 AS next FROM job_events WHERE job_id = @jobId`)
          .get({ jobId: jid });
        const id = next?.next ?? 1;
        const ts = new Date().toISOString();
        const event: JobEvent = { id, jobId: jid, type: eventType, ts, data: dataToWrite };

        this.db
          .prepare(
            `INSERT INTO job_events (job_id, id, type, ts, data) VALUES (@jobId, @id, @type, @ts, @data)`,
          )
          .run({
            jobId: jid,
            id,
            type: eventType,
            ts,
            data: JSON.stringify(dataToWrite),
          });

        const status = statusForEvent(eventType);
        const error =
          eventType === "queued"
            ? null
            : eventType === "failed" || eventType === "rejected"
              ? (dataToWrite.error ?? "job failed")
              : undefined;

        if (status && error !== undefined) {
          this.db
            .prepare(
              `UPDATE jobs SET last_event_id = @id, status = @status, error = @error, updated_at = @ts WHERE id = @jobId`,
            )
            .run({ id, status, error, ts, jobId: jid });
        } else if (status) {
          this.db
            .prepare(
              `UPDATE jobs SET last_event_id = @id, status = @status, updated_at = @ts WHERE id = @jobId`,
            )
            .run({ id, status, ts, jobId: jid });
        } else {
          this.db
            .prepare(`UPDATE jobs SET last_event_id = @id, updated_at = @ts WHERE id = @jobId`)
            .run({ id, ts, jobId: jid });
        }

        return event;
      },
    );

    const event = txn.immediate(jobId, type, data);
    this.notify(jobId, event);
    return event;
  }

  since(jobId: string, lastEventId: number): JobEvent[] {
    const rows = this.db
      .prepare<{ jobId: string; lastEventId: number }, EventRow>(
        `SELECT job_id, id, type, ts, data FROM job_events
         WHERE job_id = @jobId AND id > @lastEventId
         ORDER BY id ASC`,
      )
      .all({ jobId, lastEventId: lastEventId > 0 ? lastEventId : 0 });
    return rows.map(parseEventRow);
  }

  latestId(jobId: string): number {
    const row = this.db
      .prepare<
        { jobId: string },
        { maxId: number | null }
      >(`SELECT MAX(id) AS maxId FROM job_events WHERE job_id = @jobId`)
      .get({ jobId });
    return row?.maxId ?? 0;
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

  private notify(jobId: string, event: JobEvent): void {
    const listeners = this.subs.get(jobId);
    if (!listeners) return;
    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        // a broken listener must never break the append path
      }
    }
  }
}

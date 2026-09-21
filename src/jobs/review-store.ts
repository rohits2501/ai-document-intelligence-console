import type Database from "better-sqlite3";
import { z } from "zod";
import { StoreDataError } from "./store-errors";

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

export interface ReviewStore {
  get(jobId: string): ReviewRecord | undefined;
  put(record: ReviewRecord): void;
}

const ReviewedFieldSchema = z.object({
  key: z.string(),
  value: z.string(),
  approved: z.boolean(),
});

const ReviewRecordSchema = z.object({
  jobId: z.string(),
  fields: z.array(ReviewedFieldSchema),
  submittedAt: z.string(),
});

export class InMemoryReviewStore implements ReviewStore {
  private records = new Map<string, ReviewRecord>();

  get(jobId: string): ReviewRecord | undefined {
    return this.records.get(jobId);
  }

  put(record: ReviewRecord): void {
    this.records.set(record.jobId, record);
  }
}

interface ReviewRow {
  job_id: string;
  fields: string;
  submitted_at: string;
}

export class SqliteReviewStore implements ReviewStore {
  constructor(private readonly db: Database.Database) {}

  get(jobId: string): ReviewRecord | undefined {
    const row = this.db
      .prepare<
        { jobId: string },
        ReviewRow
      >(`SELECT job_id, fields, submitted_at FROM reviews WHERE job_id = @jobId`)
      .get({ jobId });
    if (!row) return undefined;
    let fields: unknown;
    try {
      fields = JSON.parse(row.fields) as unknown;
    } catch (err) {
      throw new StoreDataError("corrupt review row", { job_id: row.job_id }, err);
    }
    const parsed = ReviewRecordSchema.safeParse({
      jobId: row.job_id,
      fields,
      submittedAt: row.submitted_at,
    });
    if (!parsed.success) {
      throw new StoreDataError("corrupt review row", { job_id: row.job_id });
    }
    return parsed.data;
  }

  put(record: ReviewRecord): void {
    this.db
      .prepare(
        `INSERT INTO reviews (job_id, fields, submitted_at)
         VALUES (@jobId, @fields, @submittedAt)
         ON CONFLICT(job_id) DO UPDATE SET
           fields = excluded.fields,
           submitted_at = excluded.submitted_at`,
      )
      .run({
        jobId: record.jobId,
        fields: JSON.stringify(record.fields),
        submittedAt: record.submittedAt,
      });
  }
}

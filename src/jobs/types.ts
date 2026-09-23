import { z } from "zod";

/**
 * Core data model + job/event contract. See docs/specs/0002-data-model-job-event-protocol.md.
 * Status and event vocabulary are aligned to document AI so the console maps 1:1 to the domain.
 */

export const JOB_STATUSES = [
  "queued",
  "processing",
  "partially_completed",
  "completed",
  "failed",
  "rejected",
] as const;
export const JobStatus = z.enum(JOB_STATUSES);
export type JobStatus = z.infer<typeof JobStatus>;

export const TERMINAL_STATUSES: readonly JobStatus[] = [
  "partially_completed",
  "completed",
  "failed",
  "rejected",
];
export function isTerminal(status: JobStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export const JOB_EVENT_TYPES = [
  "queued",
  "processing",
  "page_processed",
  "extraction_started",
  "partial_result",
  "completed",
  "partially_completed",
  "failed",
  "rejected",
  "cancelled",
  "heartbeat",
] as const;
export const JobEventType = z.enum(JOB_EVENT_TYPES);
export type JobEventType = z.infer<typeof JobEventType>;

export const JobKind = z.enum(["digitise", "extract"]);
export type JobKind = z.infer<typeof JobKind>;

export const BBox = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
});
export type BBox = z.infer<typeof BBox>;

/** Mirrors the extract `annotations` shape: every leaf has confidence + sources. */
export const ExtractedField = z.object({
  key: z.string(),
  value: z.string(),
  confidence: z.number().min(0).max(1),
  page: z.number().int().nonnegative().nullable().default(null),
  bbox: BBox.nullable().default(null),
  source: z.string().nullable().default(null),
});
export type ExtractedField = z.infer<typeof ExtractedField>;

export const DocumentRecord = z.object({
  id: z.string(),
  name: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  pageCount: z.number().int().positive().nullable().default(null),
  storageKey: z.string(),
  createdAt: z.string(),
});
export type DocumentRecord = z.infer<typeof DocumentRecord>;

export const Job = z.object({
  id: z.string(),
  documentId: z.string(),
  kind: JobKind,
  status: JobStatus,
  lastEventId: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
  error: z.string().nullable().default(null),
});
export type Job = z.infer<typeof Job>;

/** Per-type event payloads. Kept small and explicit so the SSE `event:` name maps to a shape. */
export const JobEventData = z.object({
  page: z.number().int().nonnegative().optional(),
  totalPages: z.number().int().positive().optional(),
  fields: z.array(ExtractedField).optional(),
  failed: z.array(z.string()).optional(),
  error: z.string().optional(),
  message: z.string().optional(),
  /** Distinguishes retries in the append only log (spec 0005 AC-9). 1 on first queued. */
  attempt: z.number().int().positive().optional(),
});
export type JobEventData = z.infer<typeof JobEventData>;

export const JobEvent = z.object({
  id: z.number().int().positive(), // monotonic per job, 1-based
  jobId: z.string(),
  type: JobEventType,
  ts: z.string(),
  data: JobEventData,
});
export type JobEvent = z.infer<typeof JobEvent>;

/** Map an event type to the job status it implies, when it is a status-bearing event. */
export function statusForEvent(type: JobEventType): JobStatus | null {
  switch (type) {
    case "queued":
      return "queued";
    case "processing":
    case "page_processed":
    case "extraction_started":
    case "partial_result":
      return "processing";
    case "completed":
      return "completed";
    case "partially_completed":
      return "partially_completed";
    case "failed":
      return "failed";
    case "rejected":
      return "rejected";
    case "cancelled":
      return "failed"; // cancellation is a failed terminal for status purposes
    case "heartbeat":
      return null;
  }
}

import type { ExtractedField, JobEvent, JobStatus } from "./types";

/**
 * Client-side job state derived purely from the event stream. The reducer is the client job state
 * machine (spec 0001). It is idempotent per event id: applying the same event twice is a no-op, so
 * reconnect replay cannot corrupt state.
 */
export interface JobViewState {
  status: JobStatus;
  pagesProcessed: number;
  totalPages: number | null;
  fields: ExtractedField[];
  events: JobEvent[];
  lastEventId: number;
  failedKeys: string[];
  error: string | null;
}

export const initialJobState: JobViewState = {
  status: "queued",
  pagesProcessed: 0,
  totalPages: null,
  fields: [],
  events: [],
  lastEventId: 0,
  failedKeys: [],
  error: null,
};

function mergeFields(existing: ExtractedField[], incoming: ExtractedField[]): ExtractedField[] {
  const byKey = new Map(existing.map((f) => [f.key, f]));
  for (const f of incoming) byKey.set(f.key, f);
  return [...byKey.values()];
}

export function jobReducer(state: JobViewState, event: JobEvent): JobViewState {
  // Idempotency + ordering guard: ignore anything we've already applied.
  if (event.id <= state.lastEventId) return state;

  const base: JobViewState = {
    ...state,
    lastEventId: event.id,
    events: [...state.events, event],
  };

  switch (event.type) {
    case "queued":
      // A queued event marks a (re)start: reset run-derived state so a retry does not show the
      // previous run's progress/fields while the new run streams in.
      return {
        ...base,
        status: "queued",
        pagesProcessed: 0,
        totalPages: null,
        fields: [],
        failedKeys: [],
        error: null,
      };
    case "processing":
    case "extraction_started":
      return { ...base, status: "processing" };
    case "page_processed":
      return {
        ...base,
        status: "processing",
        pagesProcessed: event.data.page ?? base.pagesProcessed,
        totalPages: event.data.totalPages ?? base.totalPages,
      };
    case "partial_result":
      return {
        ...base,
        status: "processing",
        fields: mergeFields(base.fields, event.data.fields ?? []),
      };
    case "completed":
      return { ...base, status: "completed" };
    case "partially_completed":
      return {
        ...base,
        status: "partially_completed",
        failedKeys: event.data.failed ?? [],
      };
    case "failed":
      return { ...base, status: "failed", error: event.data.error ?? "job failed" };
    case "rejected":
      return { ...base, status: "rejected", error: event.data.error ?? "job rejected" };
    case "cancelled":
      return { ...base, status: "failed", error: "cancelled by operator" };
    case "heartbeat":
      return base;
    default:
      return base;
  }
}

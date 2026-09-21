# 0002 · Data model & job/event protocol

**Status**: Accepted
**Date**: 2026-09-21
**Mode**: FEATURE
**Feature**: Data model & job/event protocol (scope #3)

## Summary

Define the core entities and the streaming contract every later slice builds on: `Document`, `Job`, the append only `JobEvent` log, `ExtractedField`, and the `ExtractionProvider` interface. The job status vocabulary and reconnect/cancel/retry semantics are pinned here, aligned to Sarvam's real Doc AI job API so the console maps 1:1 to the target domain.

## Requirements

- AC-1: A `Job` has a stable `id`, a `documentId`, a `status`, timestamps, and a monotonic `lastEventId`.
- AC-2: Job status is one of `queued`, `processing`, `partially_completed`, `completed`, `failed`, `rejected`. The terminal set is `completed | partially_completed | failed | rejected`.
- AC-3: Every state change appends a typed `JobEvent` with a monotonic integer `id` (per job), a `type`, a `ts`, and a JSON `data` payload. The event log is append only and is the single source of truth for job state.
- AC-4: Event types cover the pipeline: `queued`, `processing`, `page_processed`, `extraction_started`, `partial_result`, `completed`, `failed`, `rejected`, `cancelled`, `heartbeat`.
- AC-5: A client can reconnect with a `Last-Event-ID` and receive every event after that id, in order, with no gaps and no duplicates, then continue live.
- AC-6: An `ExtractedField` carries `key`, `value`, `confidence` (0..1), optional `page`, and an optional `bbox` (normalized `x,y,w,h`), matching the Sarvam extract `annotations` shape (`confidence` + `sources`).
- AC-7: The `ExtractionProvider` interface exposes `digitise(doc)` and `extract(doc, schema)` returning an async event stream, so the `mock` provider and a real `sarvam-docai` provider are interchangeable with no UI change.
- AC-8: All identifiers used across a request are correlation friendly: `request_id`, `job_id`, `document_id`.
- AC-9: The event log store is behind an interface so the in memory demo store can be swapped for SQLite/Redis without touching callers.

## Decision

### Entities

```
Document
  id: string            # document_id
  name: string
  sizeBytes: number
  pageCount: number | null
  storageKey: string    # local disk key for the demo
  createdAt: string

Job
  id: string            # job_id
  documentId: string
  kind: "digitise" | "extract"
  status: JobStatus
  lastEventId: number   # monotonic cursor
  createdAt: string
  updatedAt: string
  error: string | null

JobEvent                # append only, ordered per job
  id: number            # monotonic per job, 1-based
  jobId: string
  type: JobEventType
  ts: string
  data: unknown         # zod-validated per type

ExtractedField
  key: string
  value: string
  confidence: number    # 0..1
  page: number | null
  bbox: { x: number; y: number; w: number; h: number } | null   # normalized 0..1
  source: string | null # mirrors Sarvam annotations.sources
```

### Status and event vocabulary (aligned to Sarvam Doc AI)

- `JobStatus = "queued" | "processing" | "partially_completed" | "completed" | "failed" | "rejected"`.
- `JobEventType = "queued" | "processing" | "page_processed" | "extraction_started" | "partial_result" | "completed" | "partially_completed" | "failed" | "rejected" | "cancelled" | "heartbeat"`.
- `partial_result` events carry one or more `ExtractedField`s as they are found; `partially_completed` is the terminal status when some fields failed.

### Streaming contract

- `POST /api/jobs` `{ documentId, kind }` → `{ jobId }`, appends `queued`.
- `GET /api/jobs/:id/events` is SSE. It reads the log from `Last-Event-ID` (header or `?lastEventId=`), replays missed events, then follows live. Each SSE message sets `id:` to the event id and `event:` to the type. A `heartbeat` comment is sent every ~15s. Response headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`.
- `POST /api/jobs/:id/cancel` → appends `cancelled`, moves the worker to a terminal state. Control plane only; never on the stream.
- `POST /api/jobs/:id/retry` → for a terminal-failed job, starts a fresh run appending from the next event id.

### Provider interface

```ts
interface ExtractionProvider {
  digitise(doc: Document, signal: AbortSignal): AsyncIterable<ProviderEvent>;
  extract(doc: Document, schema: ExtractSchema, signal: AbortSignal): AsyncIterable<ProviderEvent>;
}
type ProviderEvent =
  | { type: "page_processed"; page: number; totalPages: number }
  | { type: "partial_result"; fields: ExtractedField[] }
  | { type: "completed" }
  | { type: "partially_completed"; failed: string[] }
  | { type: "failed"; error: string };
```

The job worker consumes `ProviderEvent`s and appends `JobEvent`s to the log. Swapping providers never touches the log, the SSE endpoint, or the UI (AC-7).

## Build plan

1. `src/jobs/types.ts` — zod schemas + TS types for `Document`, `Job`, `JobEvent`, `ExtractedField`, status/event unions. (AC-1,2,3,4,6,8)
2. `src/jobs/event-log.ts` — append only, ordered, in memory log behind an `EventLogStore` interface, with `append`, `since(lastEventId)`, and a `subscribe` fan-out. (AC-3,5,9)
3. `src/jobs/store.ts` — job + document records behind interfaces. (AC-1,9)
4. `src/extraction/provider.ts` — the `ExtractionProvider` interface + `ProviderEvent`. (AC-7)
5. `src/jobs/worker.ts` — runs a provider, maps `ProviderEvent` → `JobEvent`, honors `AbortSignal` for cancel. (AC-2,4)

## Consequences

- The event log as source of truth makes reconnect, refresh, and multi tab fall out for free (AC-5).
- In memory store loses data on restart; acceptable for the demo, swappable via AC-9.
- Aligning to Sarvam status names means the portfolio reads as domain-aligned, and a real provider is a drop-in.

## Follow-up

- Real `sarvam-docai` provider (deferred scope #12) maps its poll based status to these events.

## Rationale

Sarvam Doc AI is a poll based job API with statuses `completed`/`partially_completed`/`failed`/`rejected` and annotations carrying `confidence` + `sources`. Mirroring that vocabulary while layering an SSE cursor over a durable log is the practical Staff-level trade off: correct transport for server→client streaming, durable replay, and a poll fallback path.

## References

- Sarvam Digitise/Extract job API and status model: https://docs.sarvam.ai/api-reference/doc-ai/job/digitise , https://docs.sarvam.ai/api-reference/doc-ai/job/extract
- SSE Last-Event-ID replay pattern: https://dreaming.press/posts/streaming-ai-agent-output-sse-vs-websockets.html

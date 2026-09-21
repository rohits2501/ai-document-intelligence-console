# 0001 · Stack & architecture

**Status**: Accepted
**Date**: 2026-09-21
**Mode**: ARCHITECTURE
**Feature**: Stack & architecture (scope #1)

## Summary

Choose the stack and top level architecture for the AI Document Intelligence Console. The product is a job console: an operator drops a document, a long running job processes it, the UI streams live status from an append only event log, and the operator reviews and approves extracted fields over a large document viewer.

The dominant forces are all frontend: real time streaming of a server driven job, continuously changing UI state, large documents that must stay responsive, and reliable behaviour around retries, cancellation, and partial results. The stack is chosen to make those first class.

## Requirements

- AC-1: The app runs locally with one command and no external services or API keys required for the core demo.
- AC-2: The app is a single deployable unit that serves both the UI and the job/stream API (no separate backend to run for the demo).
- AC-3: The stack uses TypeScript end to end with strict type checking.
- AC-4: The stack supports server to client streaming over plain HTTP (Server Sent Events) for job status, plus normal HTTP endpoints for control actions (cancel, retry) and uploads.
- AC-5: The stack supports long lists and large documents rendered with virtualization, so only near viewport content mounts.
- AC-6: Extraction is behind a provider interface so a mock provider is the default and a real provider can be added later without UI changes.
- AC-7: The scaffold boots locally and passes `build`, `lint`, and `typecheck`.

## Decision

### Proposed stack

| Concern | Choice | Why |
|---|---|---|
| Framework | Next.js (App Router) | Named directly in the target JD. One unit serves UI + route handlers, which satisfies AC-2. Route handlers stream SSE and host upload/control endpoints. |
| Language | TypeScript (strict) | AC-3. Shared types across client and server route handlers. |
| UI runtime | React 18 | Concurrent rendering, Suspense, and the ecosystem for virtualization. |
| Streaming transport | Native `EventSource` (SSE) over an append only event log; control actions as plain `POST` | Job status is server → client, which is SSE's shape. Cancel/retry are a thin control plane, so they are separate `POST` routes, not a socket. Satisfies AC-4. |
| Job/event store (demo) | In process, in memory store behind an interface (swappable for SQLite/Redis) | AC-1: zero external services for the demo. The event log is the source of truth; the SSE connection is a disposable cursor over it. |
| Extraction provider | Provider interface with a `mock` default; real `sarvam-docai` provider addable later | AC-6. Keeps the demo runnable and honest. |
| Document rendering | `pdfjs-dist` via `react-pdf` | Mature PDF rendering in the browser; page level control needed for virtualization. |
| Virtualization | `@tanstack/react-virtual` | AC-5. Windowing for pages and long result lists. |
| Validation/contracts | `zod` | Runtime validation of upload input and provider output; typed contracts. |
| Job state machine (client) | `zustand` store + a small typed reducer | Predictable client side job state derived from the event stream. |
| Telemetry | Thin structured logger + span helper with correlation ids (`request_id`, `job_id`, `document_id`); OpenTelemetry web SDK optional later | Observability without a mandatory collector for the demo. |
| Tests | `vitest` (unit) + Playwright optional later | Locks the job/event machine (Beta tier on scope #1 and #5). |
| Package manager | npm | Already present (npm 10). No extra tooling to install. |

### Runner up

Vite + React SPA plus a small standalone Node SSE server. Rejected as the default because it splits the demo into two processes (fails AC-2 cleanly) and the JD explicitly names Next.js. Kept as a documented fallback if the App Router streaming model proves limiting.

### Streaming architecture (the load bearing decision)

- The job runs in a worker like task that appends typed events to a durable, ordered event log keyed by `job_id`, each event carrying a monotonic `id`.
- `GET /api/jobs/:id/events` is an SSE endpoint that replays from `Last-Event-ID` then follows live. Reconnect, refresh, and multi tab all fall out of the log being the source of truth.
- `POST /api/jobs/:id/cancel` and `POST /api/jobs/:id/retry` are the control plane. We do not use `useChat({ resume })` from the AI SDK: resume and abort are mutually exclusive there, and we need both reconnect and explicit cancel. Owning the event log gives us both.
- Heartbeat comments keep intermediaries from killing a long connection; responses set `no-transform`/`X-Accel-Buffering: no` to stop proxy buffering.

## Build plan (derived by /develop at scaffold time)

1. Initialize the Next.js App Router project in place with TypeScript strict (framework initializer). (AC-1..3)
2. Install only the runnable skeleton the first slice needs (framework, React, TypeScript). Defer feature libraries (pdf, virtual, zod, zustand, vitest) to the slices that first use them. (AC-7)
3. Lay out `app/` and `src/` directories; confirm `dev`, `build`, `lint`, `typecheck` run. (AC-7)

Cross cutting tooling (lint/format/type strictness) is captured by `/audit` and installed by `/develop tooling`, not here.

## Consequences

- One process serves everything: simple demo, and a realistic place to reason about SSE behind a proxy.
- In memory store means a server restart clears jobs. Acceptable for a portfolio demo; the interface allows SQLite/Redis later.
- Next.js route handlers can stream SSE, but long running work needs care on serverless; for local/self hosted demo a long lived route or a background task is fine, and the event log design already assumes the worker is separate from the stream.

## Follow-up

- Decide the exact job status vocabulary and event schema in spec 0002 (Data model & job/event protocol), aligned to the real Sarvam Doc AI statuses.
- Add the real `sarvam-docai` provider in the deferred stretch feature.

## Rationale

Sarvam's real Doc AI product is a poll based job API (`digitise`/`extract`, poll status). Building an SSE cursor over a durable event log, with polling as a fallback, is the practical architectural trade off the Staff JD asks for. SSE is the correct transport for one directional server → client streaming; a bidirectional WebSocket would be machinery we use ten percent of.

## References

- Sarvam Document Intelligence Overview: https://docs.sarvam.ai/api/api-guides-tutorials/document-intelligence/overview
- Sarvam Digitise / Extract job API: https://docs.sarvam.ai/api-reference/doc-ai/job/digitise , https://docs.sarvam.ai/api-reference/doc-ai/job/extract
- SSE vs WebSockets for AI streaming: https://dreaming.press/posts/streaming-ai-agent-output-sse-vs-websockets.html , https://getstream.io/blog/websocket-sse/
- AI SDK resume vs abort incompatibility: https://ai-sdk.dev/docs/troubleshooting/abort-breaks-resumable-streams

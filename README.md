# AI Document Intelligence Console

An operator console for **long-running document AI jobs**. Drop a document, watch a job stream its
progress live, then review, edit, and approve the extracted fields over a large, virtualized
document viewer.

Built on
the document AI product
(the vision model)

## Why this project

The interesting engineering is not the form — it's the **real-time data plane over long-running,
partially-failing work**:

- A **durable, append-only event log** is the source of truth for every job.
- **SSE** is a *disposable cursor* over that log: reconnect with `Last-Event-ID` replays missed
  events gap-free, then follows live. Refresh, multi-tab, and flaky networks all "just work".
- **Cancel/retry** live on a separate HTTP control plane, never on the stream.
- Extraction is **pluggable**: mock ↔ real document AI with no change to the log, the stream, or
  the UI.

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
```

Then drop any PDF/image, watch the job stream, and review the extracted fields. No keys needed.

```bash
npm run build      # production build
npm run typecheck  # tsc --noEmit (strict)
npm run lint       # next lint
npm test           # vitest (job machine, providers)
npm run format     # prettier
```

## Architecture at a glance

```
Upload (chunked, resumable)
   → Document record
      → Job  ──(worker runs a Provider)──▶  append-only Event Log  ◀── source of truth
                                                   │
                    control plane (POST)           │ SSE cursor (GET, Last-Event-ID replay)
                cancel / retry ──────────▶ Job ◀───┤
                                                   ▼
                                        Console UI (job state machine)
                                        · progress · timeline · diagnostics
                                        · virtualized viewer + bbox overlay
                                        · human review (edit / approve)
```

- **Data plane** (server → client): `GET /api/jobs/:id/events` (SSE).
- **Control plane** (client → server): `POST /api/jobs/:id/{cancel,retry}`, `POST /api/jobs`.
- **Provider interface**: `src/extraction/provider.ts` (mock | docai).
- Full design decisions live in [`docs/specs/`](docs/specs/); the living plan is in
  [`docs/scope/scope.md`](docs/scope/scope.md).

### Job lifecycle & statuses (aligned to document AI)

`queued → processing → (completed | partially_completed | failed | rejected)`

Extracted fields carry `confidence` and `sources` (page + normalized bounding box), mirroring the
`extract` `annotations` shape.

## How this maps to the Staff Frontend JD

| JD signal | Where it lives here |
|---|---|
| **Real-time interactions / streaming UIs** | SSE data plane over an append-only event log with `Last-Event-ID` replay, heartbeats, and `no-transform` proxy handling — `app/api/jobs/[id]/events/route.ts`, `src/jobs/useJobStream.ts` |
| **Long-running tasks & partial results** | Job worker streaming `page_processed`/`partial_result`/`partially_completed`; client job state machine derived purely from events — `src/jobs/worker.ts`, `src/jobs/job-state.ts` |
| **Cancellation & control** | HTTP control plane separate from the stream; `AbortSignal` threaded through the worker/provider — `app/api/jobs/[id]/{cancel,retry}` |
| **Large documents / performance** | Virtualized viewer mounting only near-viewport pages via `@tanstack/react-virtual`; pdf.js rendering with graceful frame fallback — `src/components/DocumentViewer.tsx` |
| **Complex data-heavy UI + human-in-the-loop** | Confidence-scored fields with bounding-box overlays and an editable review/approve flow that survives late partial results — `DocumentViewer` (Overlay), `ReviewList` |
| **Robust uploads** | Chunked, resumable upload with per-chunk retry/backoff, cancel, and IndexedDB-backed resume across reloads (server validates offsets, 409 → authoritative offset) — `src/upload/**`, `app/api/upload/**` |
| **Type safety & contracts** | End-to-end TypeScript strict (`noUncheckedIndexedAccess`) with Zod runtime validation on every boundary — `src/jobs/types.ts` |
| **Observability / debugging in prod** | Structured JSON logs, `span()` timing, correlation ids (`request_id`/`job_id`/`document_id`), and a console Diagnostics panel — `src/telemetry/`, `JobConsole` |
| **Testing, CI, feature flags, releases** | Vitest suite on the job machine; GitHub Actions running lint→typecheck→format→test→build; typed feature flags gating features at runtime — `.github/workflows/ci.yml`, `src/flags/` |
| **Integrating with model/AI APIs** | Pluggable provider; real document AI provider bridging a poll-based job API onto the push/event model — `src/extraction/docai-provider.ts` |

<img width="1145" height="780" alt="image" src="https://github.com/user-attachments/assets/fedceb19-035a-4f42-aa80-84aae8be80ed" />


## Tech

Next.js 14 (App Router), React 18, TypeScript (strict), SSE via native `EventSource`, Zod, Zustand,
`@tanstack/react-virtual`, `react-pdf`/`pdfjs-dist`, `better-sqlite3`, Vitest.

## Notes & limits

- Jobs, events, documents, and reviews persist to an embedded SQLite file (`<dataDir>/doc-intel.db`)
  on a **single Node process** (local or self-hosted). `DATA_DIR` selects the data root, then
  serverless `/tmp`, then local `.data`. Uploads share that root under `uploads/`.
- On Vercel, durability is **best effort per isolate**: each isolate has its own `/tmp` and its own
  in-process SSE fan-out, so an append in one isolate does not notify a subscriber in another, and a
  later request may land on a cold isolate with an empty store. True cross-restart replay is a
  single-process property, not a serverless one.
- Set `FEATURE_DURABLE_STORE=false` (or `NODE_ENV=test`) to force the in-memory store. A failed
  database open returns 5xx; it does not silently fall back to memory.
- Retention is still unbounded (a follow-up). The default provider is a **mock**; extraction values
  are illustrative fixtures.
- No auth/accounts (single-operator demo).

## Built with a spec-driven workflow

This repo was built with the nine JS Mastery workflow skills in `.agents/skills/`
(`/scope → /architect → /develop → /check → /test → /sync → /document`), so the history reads as
decisions (`docs/specs/`), a living plan (`docs/scope/`), and the code that implements them.

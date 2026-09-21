# AGENTS.md

Project context for AI coding agents. Every workflow skill reads this file. Keep it short and true to the real code.

## What this is

The AI Document Intelligence Console: an operator console for long running document processing jobs. An operator drops a document, a job processes it, the UI streams live status from an append only event log, and the operator reviews and approves extracted fields over a large document viewer. Built as a Staff Frontend portfolio piece.

## Stack

- Next.js 14 (App Router) + React 18, TypeScript strict.
- Streaming: native `EventSource` (SSE) over an append only event log; control actions (`cancel`, `retry`) are plain `POST` route handlers.
- Extraction is behind a provider interface; a `mock` provider is the default, a real `sarvam-docai` provider is optional.
- Document rendering: `pdfjs-dist` via `react-pdf`; virtualization via `@tanstack/react-virtual` (added in the slices that use them).
- Validation: `zod`. Client job state: `zustand`.
- Tests: `vitest`.
- Package manager: npm.

## Commands

- `npm run dev` — local dev server.
- `npm run build` — production build (must pass before a slice is done).
- `npm run typecheck` — `tsc --noEmit`, strict.
- `npm run lint` — `next lint`.
- `npm test` — `vitest run`.

## Layout

- `app/` — App Router pages and route handlers.
  - `app/page.tsx`, `app/jobs/[id]/page.tsx` — home (upload + job list) and job console.
  - `app/api/jobs/` — create/list jobs, single job, SSE events, cancel, retry, review.
  - `app/api/upload/` — whole-file upload plus chunked `init`/`chunk`/`complete`.
  - `app/api/documents/[id]/file/` — stream stored document bytes to the viewer.
- `src/` — non route code, imported via the `@/*` path alias.
  - `src/jobs/` — types (zod), append only event log (source of truth), stores, worker, runtime
    singletons, client job state machine (`job-state.ts`) + `useJobStream` SSE hook.
  - `src/upload/` — local disk storage, in-memory upload sessions, chunked/resumable client.
  - `src/extraction/` — provider interface + `mock` and `sarvam-docai` providers + registry.
  - `src/components/` — `JobConsole`, `DocumentViewer` (virtualized + overlay), `ReviewList`,
    `UploadPanel`, `JobList`.
  - `src/ui/` — design-system primitives. `src/telemetry/` — logs/spans/correlation ids.
  - `src/flags/` — typed feature flags (NEXT_PUBLIC_*).
- `docs/` — the workflow's durable state (`docs/scope/`, `docs/specs/`, `docs/reviews/`). Not a published site, so files live here directly.
- `public/pdf.worker.min.mjs` — pdf.js worker served locally (no CDN dependency).
- `.github/workflows/ci.yml` — CI: lint → typecheck → format:check → test → build.

## Conventions

- TypeScript strict, including `noUncheckedIndexedAccess`. No `any` unless justified with a comment.
- Import internal modules via the `@/` alias (`@/jobs/...`), not long relative paths.
- The event log is the source of truth. The SSE connection is a disposable cursor over it: never store job state only in the connection. Every event carries a monotonic `id`; clients reconnect with `Last-Event-ID` and replay.
- Cancel and retry are HTTP `POST`, never carried on the stream.
- Extraction output shape mirrors the real Sarvam Doc AI contract: results carry `text`/`tag`/bounding box; extracted fields carry `confidence` and `sources`. Job statuses: `queued`, `processing`, `partially_completed`, `completed`, `failed`, `rejected`.
- Every request/job carries correlation ids: `request_id`, `job_id`, `document_id`.
- Do not claim production OCR/media experience anywhere; the default provider is a mock and the app says so.

## Build approach

Tracer Bullet: one thin real thread through every layer first (upload → job → event log → SSE → one field), then thicken each segment. Foundations (stack, data model, design system) come before slices.

## Workflow

Default tier Alpha (`/develop` then `/check verify`). Stack & architecture and the Core job loop are Beta (also `/test`). `/check review` and `/document` run once at the end.

## Agent skills

The nine JS Mastery workflow skills are installed in `.agents/skills/` and govern how work is done:

- `.agents/skills/scope` — turn an idea into `docs/scope/`.
- `.agents/skills/audit` — write these `AGENTS.md` files from the real code.
- `.agents/skills/architect` — make a decision, write it as a spec in `docs/specs/`.
- `.agents/skills/develop` — build a feature from its spec (the only skill that writes app code).
- `.agents/skills/check` — verify the running app, then review on a fresh model (`docs/reviews/`).
- `.agents/skills/test` — write tests for the change.
- `.agents/skills/document` — write PR/changelog/release notes from the real diff.
- `.agents/skills/sync` — reconcile scope, specs, and this file with the code.
- `.agents/skills/debug` — find and fix the root cause of a bug, then hand a regression test to `/test`.

# Scope: AI Document Intelligence Console

A document intelligence job console for operators: drop a document, watch a long running processing job stream its progress, then review, edit, and approve the extracted fields on the page. Built as a Staff Frontend portfolio piece around real time streaming, long running jobs, large documents, and human review.

**Build approach:** Tracer Bullet (prove one thin real thread through every layer first, then thicken each segment).
**Workflow:** Alpha (after `/develop`, run `/check verify`). Four features carry a `· Beta` tag (Stack & architecture, Core job loop, Durable job store, Exported observability) so they also get `/test`, because the job machine, the store that holds it, and the export contract must stay locked by tests. `/check review` and `/document` run once at the end.

_These are recommendations to keep your build orderly, not requirements. Skip anything that does not fit: if you already know how to build a feature, use `/develop` and skip `/architect`. You decide when a feature is `done`._

## At a glance

| # | Feature | Phase | Status |
|---|---------|-------|--------|
| 1 | Stack & architecture | Foundation | done |
| 2 | Coding standards & tooling | Foundation | done |
| 3 | Data model & job/event protocol | Foundation | done |
| 4 | Design system & UI foundation | Foundation | done |
| 5 | Core job loop (upload → job → stream → one field) | Slice 1 | done |
| 6 | Resumable chunked upload | Slice 2 | done |
| 7 | Virtualized document viewer | Slice 3 | done |
| 8 | Extraction overlay | Slice 4 | done |
| 9 | Human review & approval | Slice 5 | done |
| 10 | Observability & performance | Slice 6 | done |
| 11 | Reliability & release | Slice 7 | done |
| 12 | Real extraction provider + media stretch | Deferred | done (provider) |
| 13 | Durable job store | Slice 8 | in-progress |
| 16 | Measured performance | Slice 9 | planned |
| 17 | Exported observability | Slice 10 | planned |
| 14 | Operator job queue | Slice 11 | planned |
| 15 | Extract schema on upload | Slice 12 | planned |

## Foundations

### 1. Stack & architecture · done · Beta
Decide the stack and scaffold a runnable project so every later slice builds on real structure.
**Done when:** the stack is recorded in a spec and the empty scaffold boots locally and passes build.
- [x] Decide the stack (spec): `/architect stack & architecture`
- [x] Build it: `/develop stack & architecture`
   - [x] Initialize Next.js App Router + TypeScript strict in place (AC-1..3)
   - [x] Install runnable skeleton only; lay out `app/` and `src/` (AC-7)
   - [x] Confirm dev/build/lint/typecheck run (AC-7)
- [x] Verify it: build + typecheck + lint pass
Spec [0001](../specs/0001-stack-and-architecture.md) · code in `./`

### 2. Coding standards & tooling · done
Capture conventions, then install lint, format, and type strictness from the real scaffolded project.
**Done when:** root `AGENTS.md` reflects the real stack, and lint/format/typecheck run clean.
- [x] Capture conventions + tooling choices: `/audit` (root `AGENTS.md` + `CLAUDE.md` pointer)
- [x] Install the tooling: `/develop tooling` (prettier, editorconfig, vitest config, scripts)

### 3. Data model & job/event protocol · done
The core entities and the job/event contract every later slice builds on: documents, jobs, the append only event log, extracted fields with confidence, and the extraction provider interface. Job status vocabulary and reconnect/cancel/retry semantics are decided here.
**Done when:** entities and the event contract support upload, streaming, review, and retries without a breaking change, and a provider can be swapped without touching the UI.
- [x] Design it (spec): `/architect data model & job/event protocol`
- [x] Build it: `/develop data model` (types, event log, store, provider, worker)
- [x] Test it: `/test` (event-log + job-state reducer, 11 tests)
Spec [0002](../specs/0002-data-model-job-event-protocol.md) · code in `src/jobs/`, `src/extraction/`

### 4. Design system & UI foundation · done
Visual language, layout primitives, and base components so the console feels cohesive and accessible.
**Done when:** `design.md` covers type/color/spacing/components, and base components handle focus and keyboard.
- [x] Design it (spec): `/architect design system & UI foundation`
- [x] Build it: `/develop design system` (tokens + Button/Card/Panel/StatusBadge/ProgressBar/FieldRow)
Spec [0003](../specs/0003-design-system-ui-foundation.md) · [design.md](../../design.md) · code in `src/ui/`

## Slice 1: Core job loop

### 5. Core job loop · done · Beta
The walking skeleton: drop one small document, create a processing job, stream its status events over the event log, and show one extracted field. Real job record, real append only event log, real UI, mock extraction. No breadth yet.
**Done when:** an operator can drop a document, watch live job events, and see one extracted field without a full page refresh.
- [x] Build it: `/develop core job loop` (upload/jobs/events/cancel/retry routes + console UI)
- [x] Verify it: drove the running app (upload → job → SSE queued…partially_completed; Last-Event-ID replay 8,9,10; cancel)
- [x] Test it: `/test` (job machine, 11 tests)
Code in `app/api/`, `app/jobs/`, `src/components/`

## Slice 2: Resumable chunked upload

### 6. Resumable chunked upload · done
Large files upload in chunks with progress, cancel, per chunk retry, and resume after a reload.
**Done when:** a large file uploads in chunks, a failed chunk retries, cancel stops it, and a reload resumes from where it left off.
- [x] Build it: `/develop resumable chunked upload` (init/chunk/complete routes + IndexedDB-backed client)
- [x] Verify it: 1.25 MB file in 512 KiB chunks; stale-offset → 409 with authoritative offset; re-init resumes at committed offset
Code in `app/api/upload/*`, `src/upload/chunked-uploader.ts`

## Slice 3: Virtualized document viewer

### 7. Virtualized document viewer · done
Render document pages with only the pages near the viewport mounted, so a large document stays responsive.
**Done when:** a many page document scrolls smoothly with only near viewport pages mounted, and the selected field scrolls into view.
- [x] Build it: `/develop virtualized document viewer` (@tanstack/react-virtual over pages, pdf.js render, frame fallback)
- [x] Verify it: viewer renders in-browser with no console errors; scroll-to-selected wired
Code in `src/components/DocumentViewer.tsx`, `app/api/documents/[id]/file`

## Slice 4: Extraction overlay

### 8. Extraction overlay · done
Show extracted fields beside the page with their confidence and bounding boxes, so a reviewer can see what was found and where.
**Done when:** extracted fields render with confidence, and selecting a field highlights its region on the page.
- [x] Build it: `/develop extraction overlay` (normalized bbox overlay, confidence-colored, click-to-select both ways)
- [x] Verify it: fields with confidence render (98%…63%), low-confidence colored, boxes overlaid on pages
Code in `src/components/DocumentViewer.tsx` (Overlay)

## Slice 5: Human review & approval

### 9. Human review & approval · done
Edit field values, approve or reject, with edits that survive a late arriving partial result.
**Done when:** a reviewer can edit a value, approve or reject, and a late partial event does not clobber an in progress edit.
- [x] Build it: `/develop human review & approval` (editable rows, approve/flag, low-confidence pre-flagged, persist + restore)
- [x] Verify it: review POST/GET round-trip persists edits + approvals; edits preserved across incoming field updates
Code in `src/components/ReviewList.tsx`, `app/api/jobs/[id]/review`

## Slice 6: Observability & performance

### 10. Observability & performance · done
Correlation ids across upload → job → events, structured logs and spans, and a client diagnostics surface.
**Done when:** every request carries `request_id`/`job_id`/`document_id`, spans cover the job run, and the console exposes correlation ids for debugging.
- [x] Build it: `/develop observability` (structured JSON logs + `span()` around the job run + console Diagnostics panel)
- [x] Verify it: logs carry job_id/document_id; Diagnostics panel shows ids, stream state, last_event_id, event count
Code in `src/telemetry/`, `src/jobs/worker.ts`, `src/components/JobConsole.tsx` (Diagnostics)

## Slice 7: Reliability & release

### 11. Reliability & release · done
One feature flag gating a slice, CI running lint/typecheck/tests, and a release note. Covers the JD's testing, releases, feature flags, and CI expectations.
**Done when:** a flag toggles a feature at runtime, CI runs green on push, and a release note describes the change.
- [x] Feature flags: `src/flags/` gating the Diagnostics panel and review editing, documented in `.env.example`
- [x] CI: `.github/workflows/ci.yml` runs lint → typecheck → format:check → test → build
- [x] Test the job machine: `/test` (mock provider + worker: 16 tests total, incl. cancel path)
- [x] Release note: `/document` (README + CHANGELOG + `docs/RELEASE_NOTES.md`)
Code in `src/flags/`, `.github/workflows/ci.yml`

## Slice 8: Durable job store

### 13. Durable job store · in-progress · Beta
Jobs, events, and reviews survive a process restart, so the event log is actually durable and the unbounded in memory store finding from review 0001 is narrowed (durability now, retention as follow up). Stream reliability (reconnect, cancel, replay after a refresh) is proven here, not as its own feature. (basis: a test suite is not a product feature)
**Done when:** after a restart, an operator can open a prior job, replay its events from Last-Event-ID, keep reviewing without losing edits, and a reconnect or cancel still lands on the same truth.
- [x] Design it (spec): `/architect durable job store`
- [x] Build it: `/develop durable job store`
   - [x] Data root helper, SQLite open on a singleton, idempotent migration (AC-1, AC-7, AC-8)
   - [x] Durable event log plus job and document stores, transactional append that keeps last_event_id consistent (AC-1, AC-2, AC-3, AC-9)
   - [x] Durable reviews plus the durable/in-memory store selector flag (AC-1, AC-4, AC-6)
- [ ] Verify it: `/check verify durable job store` (restart replay, cancel stays cancelled, serverless limit documented; AC-2, AC-5, AC-10)
- [ ] Test it: `/test durable job store`
Spec [0005](../specs/0005-durable-job-store/index.md) · code in `src/jobs/`, `src/data-dir.ts`, `src/flags/`

## Slice 9: Measured performance

### 16. Measured performance · planned · needs a decision
Written budgets for loading, rendering, and size, plus a many page document that stays usable on the console. This thickens the viewer you already have. It does not reopen the done Observability & performance row. (basis: a performance budget is a load bearing decision)
**Done when:** written budgets exist, and a many page document stays usable on the job console against those numbers.
- [ ] Design it (spec): `/architect measured performance`

## Slice 10: Exported observability

### 17. Exported observability · planned · needs a decision · Beta
Errors and timed spans you can query after a failed job, plus one page health number. Local logs and the Diagnostics panel stay. The missing story is something you can query after the page is gone. (basis: where errors and spans go is a provider choice; the export contract is easy to break)
**Done when:** after a failed job you can query the error and the timed spans by correlation id, and the console reports one page health number.
- [ ] Design it (spec): `/architect exported observability`

## Slice 11: Operator job queue

### 14. Operator job queue · planned
The home list shows document names and status filters, and updates as jobs move, so an operator can find work without a raw id list that polls every few seconds.
**Done when:** an operator can filter jobs by status, see the document name, and watch the list update as jobs progress.
- [ ] Build it: `/develop operator job queue`

## Slice 12: Extract schema on upload

### 15. Extract schema on upload · planned · needs a decision
The operator picks or pastes an extract schema when creating a job, so extract is not a fixed fixture list.
**Done when:** creating an extract job sends a schema, and the fields on the console match that schema.
- [ ] Design it (spec): `/architect extract schema on upload`

## Deferred
Out of scope for the current build pass, kept so the plan stays honest.

### 12. Real extraction provider + media stretch · done (provider)
Wire the real Sarvam Doc AI provider behind the extraction interface. The optional PDF→podcast/TTS media slice is intentionally not built (never claim production media experience).
**Done when:** the real provider runs behind the same interface when a key is present, and the mock stays the default.
- [x] Build it: `/develop real extraction provider` (`SarvamDocAiProvider` — poll status → push events, annotation mapping)
- [x] Test it: `/test` (pure `mapAnnotations` mapping, 3 cases)
- [x] Design record: spec [0004](../specs/0004-sarvam-docai-provider.md)
- [~] Media slice: intentionally out of scope
Code in `src/extraction/sarvam-provider.ts`

- **Store retention and bounding**: prune jobs and their events past a count or age, to fully close review 0001's unbounded store finding · from spec 0005 · needs a decision
- **Acrobat complete editor**: full annotation/editing suite · out of scope
- **Real object storage at 5 GB**: production upload pipeline · out of scope (local disk for the demo)
- **Authentication & accounts**: multi user auth · deferred (local single operator demo)

## Legend

- **Next step** = the first unticked box (always a command or a tracked milestone).
- **needs a decision** = run `/architect` first; otherwise straight to `/develop` (or `/audit` for standards & tooling). The tag drops once the spec is captured.
- **Status** `planned` → `in-progress` → `done`, plus `existing` (pre-workflow) and `dropped` (de-scoped, kept for history).
- **Workflow tier tag** beside a heading (e.g. `· Beta`) sets that one feature's rigor above the project default (Alpha).
- **Workflow** (header line): the project default that runs after `/develop`. Alpha = `/check verify`; Beta = `/check verify` then `/test`.
- **Pointer line** (`spec <n> · code in <path>`): the spec link added by `/architect`, the code path by `/develop`.

## References

### Project sources
- Root `AGENTS.md`: event log as source of truth, telemetry seam, do not claim production media experience.
- Spec [0001](../specs/0001-stack-and-architecture.md): in memory store behind an interface, telemetry without a mandatory collector.
- Review [0001](../reviews/0001-senior-review.md): unbounded in memory stores called out as a demo limit.
- This `/scope` pass: interview pass is durable store, measured performance, exported observability. Auth stays deferred. Stream checks fold into the store. Extract schema stays planned. Media stays deferred.

### Practices & standards
- Tracer Bullet: thicken one segment of a working thread, still end to end.
- Foundations before features (already shipped here).
- A test suite is not a product feature. `/test` owns the tests.
- Name capabilities, never the implementing tool.
- A performance budget is a load bearing decision.
- A provider or destination choice needs a spec.

# Changelog

All notable changes to this project are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/).

## Unreleased

### Added

- **Light theme** on the same token names (`html[data-theme]`). System / Light / Dark toggle;
  `design.md` is now the critique contract (tokens only, both themes, no second system).

## [0.1.0] - 2026-09-21

Initial build of the AI Document Intelligence Console.

### Added

- **Foundations**
  - Next.js 14 App Router + TypeScript (strict, `noUncheckedIndexedAccess`) scaffold.
  - Tooling: ESLint (next), Prettier, EditorConfig, Vitest.
  - Data model & job/event protocol aligned to document AI (spec 0002): `Document`, `Job`,
    append-only `JobEvent` log, `ExtractedField` (confidence + sources + bbox), `ExtractionProvider`.
  - Design system (spec 0003): CSS-variable tokens + `Button`, `Card`, `Panel`, `StatusBadge`,
    `ProgressBar`, `FieldRow` with focus/keyboard/AA contrast.
- **Core job loop (tracer)**: upload → job → SSE over the event log → one extracted field via the
  mock provider, with cancel/retry on an HTTP control plane.
- **Resumable chunked upload**: init/chunk/complete endpoints; client with per-chunk retry/backoff,
  cancel, and IndexedDB-backed resume across reloads (server validates offsets).
- **Virtualized document viewer**: `@tanstack/react-virtual` over pages, pdf.js rendering with
  frame fallback, scroll-to-selected.
- **Extraction overlay**: normalized bounding boxes, confidence-colored, click-to-select both ways.
- **Human review & approval**: editable field values, approve/flag, low-confidence pre-flagged,
  persisted and restorable; edits survive late partial results.
- **Observability**: structured JSON logs, `span` timing, correlation ids, console Diagnostics.
- **Reliability & release**: typed feature flags; GitHub Actions CI (lint → typecheck → format →
  test → build); Vitest coverage of the job machine (event log, reducer, worker, providers).
- **Real document AI provider** (stretch, spec 0004): bridges the poll-based job API onto the
  push/event model behind the same interface; mock stays the default.

### Security

- **Path traversal (blocker, found in senior review):** a client-supplied `uploadId` could shape the
  storage path and escape `.data/uploads`. `uploadId` is now validated to a fixed token shape and
  storage resolves every key strictly within the upload root.

### Fixed

- **Chunk upload race:** concurrent chunk PUTs at the same offset could corrupt a file; appends are
  now serialized per upload session.
- **Cancel classification:** aborts from a `fetch`-based provider are now recorded as `cancelled`,
  not `failed`.
- **Retry:** restricted to failed/partial/rejected, appends a fresh `queued` event, and resets
  client run state so a retry no longer shows the prior run's fields/progress.
- **Review restore:** a saved review now hydrates deterministically regardless of whether it arrives
  before or after streamed fields.
- **Cancel endpoint** returns `409` (with a reason) for non-cancellable states; overlay/review
  controls gained keyboard semantics and ARIA labels; upload sessions expire after 1h.
- SSE terminal-replay crash: a temporal-dead-zone reference in the ReadableStream `start` handler
  meant reconnecting to an already-terminal job returned an empty stream. Cleanup bindings are now
  hoisted; replay-then-subscribe is race-free (single-threaded append), and reconnecting to a
  terminal job closes immediately instead of holding the connection open.

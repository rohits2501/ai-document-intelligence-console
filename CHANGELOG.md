# Changelog

All notable changes to this project are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/).

## [0.1.0] - 2026-09-21

Initial build of the AI Document Intelligence Console.

### Added

- **Foundations**
  - Next.js 14 App Router + TypeScript (strict, `noUncheckedIndexedAccess`) scaffold.
  - Tooling: ESLint (next), Prettier, EditorConfig, Vitest.
  - Data model & job/event protocol aligned to Sarvam Doc AI (spec 0002): `Document`, `Job`,
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
- **Observability**: structured JSON logs, `span()` timing, correlation ids, console Diagnostics.
- **Reliability & release**: typed feature flags; GitHub Actions CI (lint → typecheck → format →
  test → build); Vitest coverage of the job machine (event log, reducer, worker, providers).
- **Real Sarvam Doc AI provider** (stretch, spec 0004): bridges the poll-based job API onto the
  push/event model behind the same interface; mock stays the default.

### Fixed

- SSE terminal-replay crash: a temporal-dead-zone reference in the ReadableStream `start` handler
  meant reconnecting to an already-terminal job returned an empty stream. Cleanup bindings are now
  hoisted; replay-then-subscribe is race-free (single-threaded append), and reconnecting to a
  terminal job closes immediately instead of holding the connection open.

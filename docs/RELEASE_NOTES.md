# Release notes — v0.1.0

**AI Document Intelligence Console** — first release.

An operator console for long-running document AI jobs, modeled on document AI. Upload a document,
watch the job stream live, and review/approve extracted fields on a virtualized viewer.

## Highlights

- **Live job streaming that survives reconnects.** Job status streams over SSE backed by a durable,
  append-only event log. Reconnect replays missed events gap-free (`Last-Event-ID`) and continues
  live — refresh and multi-tab included.
- **Long-running work with partial results and cancel/retry.** Page-by-page progress and partial
  extraction results, with cancellation and retry on a dedicated HTTP control plane.
- **Big documents stay smooth.** Only near-viewport pages mount (virtualization); extracted fields
  are drawn as confidence-colored bounding boxes you can click to jump to.
- **Human-in-the-loop review.** Edit values, approve or flag, with low-confidence fields pre-flagged;
  edits persist and survive late-arriving results.
- **Resumable uploads.** Chunked with retry/backoff, cancel, and resume-after-reload.
- **Pluggable extraction.** Mock provider by default (no keys); real document AI provider behind
  the same interface.
- **Production hygiene.** Strict TypeScript + Zod contracts, structured logs with correlation ids,
  feature flags, and CI running lint/typecheck/format/test/build.

## Try it

```bash
npm install && npm run dev
```

Drop any PDF/image at `http://localhost:3000`. No configuration required.

## Known limits

Jobs persist to embedded SQLite on a single Node process. On Vercel the store is best effort per
isolate (each isolate has its own `/tmp` and in-process fan-out). Retention is still unbounded. The
default provider returns illustrative fixture values. No authentication. See the README for the
full list.

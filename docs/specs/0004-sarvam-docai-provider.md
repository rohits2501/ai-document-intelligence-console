# 0004 · Real Sarvam Doc AI provider (stretch)

**Status**: Accepted
**Date**: 2026-09-21
**Mode**: FEATURE
**Feature**: Real extraction provider (scope #12)

## Summary

Implement `SarvamDocAiProvider` behind the existing `ExtractionProvider` interface so the console can
run against Sarvam's real Doc AI product. Because the provider emits the same `ProviderEvent`s as the
mock, nothing else in the system changes: the event log, SSE endpoint, job machine, and UI are
untouched. The mock stays the default so the demo runs with no keys.

## Requirements

- AC-1: Selected only when `EXTRACTION_PROVIDER=sarvam-docai`; requires `SARVAM_API_KEY`. Absent config keeps the mock default.
- AC-2: `extract` sends the document + a Sarvam extract schema; `digitise` sends the document only.
- AC-3: The poll-based job lifecycle is bridged to push events: status polls emit `page_processed`; a terminal status emits `partial_result` then `completed`/`partially_completed`/`failed`.
- AC-4: Results are mapped to `ExtractedField[]` with `confidence`, `page`, and normalized `bbox` from the first source, matching the internal model.
- AC-5: Cancellation aborts in-flight fetches and stops polling (honors `AbortSignal`).

## Decision

Sarvam Doc AI (Sarvam Vision 1.5) is a poll-based job API:

- `POST /doc-ai/v1/job/digitise` | `/extract` — multipart file, header `api-subscription-key`, returns `{ job_id, status, run_id }`.
- `GET /doc-ai/v1/job/{job_id}/status` — `{ status, pages_processed, pages_succeeded, pages_failed, ... }`; statuses `pending | running | completed | partially_completed | failed | rejected`.
- `GET /doc-ai/v1/job/{job_id}/results` — `{ result, annotations }`, where `annotations` mirror the result shape and every leaf carries `confidence` and `sources`.

The provider polls status on an interval, emits progress, and on a terminal state fetches and maps
results. `mapAnnotations` flattens `{ result, annotations }` into `ExtractedField[]`, pulling
confidence and the first source's page/bbox (object or `[x0,y0,x1,y1]` array form).

## Consequences

- The console's own status vocabulary (chosen in spec 0002) is a 1:1 match for Sarvam's, so the map is trivial and honest.
- The provider is I/O against a live API; only the pure `mapAnnotations` is unit-tested here (endpoint calls need a key + network and are out of scope for the demo's CI).

## Out of scope

- PDF→podcast / TTS media slice: intentionally not built. The console never claims production media/dubbing capability.

## References

- Overview: https://docs.sarvam.ai/api/api-guides-tutorials/document-intelligence/overview
- Extract: https://docs.sarvam.ai/api-reference/doc-ai/job/extract

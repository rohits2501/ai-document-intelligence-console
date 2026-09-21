# Review 0001 — Senior code review (fresh model)

**Date:** 2026-09-21
**Reviewer:** GPT-5.3-Codex (a different model than the one that wrote the code), read-only.
**Scope:** SSE/event-log flow, job worker + control plane, chunked upload, providers, viewer/review UI, storage/validation.

## Outcome

1 blocker + 3 high + 2 medium + 2 low. All blocker/high fixed; the quick medium/low wins fixed;
one medium (unbounded in-memory stores) partially addressed and otherwise documented as a demo limit.

## Findings & resolutions

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| 1 | blocker | Path traversal: client `uploadId` flowed into `storageKey` and `path.join(ROOT, …)`, allowing escape from `.data/uploads`. | **Fixed.** `uploadId` validated against `^up_[0-9a-f-]{36}$` in `upload/init`; `storage.ts` resolves every key with `path.resolve` and rejects anything not under `ROOT` (`resolveWithin`). Verified: crafted id → `400`. |
| 2 | high | Chunk upload race: concurrent PUTs at the same offset could both pass the size check and both append, corrupting the file. | **Fixed.** Per-`uploadId` async lock (`withUploadLock`) makes the offset-check + append atomic. Unit-tested for serialization + independence. |
| 3 | high | Cancel misclassified as `failed` when a real (`fetch`-based) provider aborts with `DOMException` `AbortError`. | **Fixed.** Worker treats `ProviderAbortError`, `AbortError`, or `signal.aborted` as cancellation → appends `cancelled`. |
| 4 | high | Retry reused the stream without a reset and allowed retrying `completed`; client could show the prior run's fields/progress. | **Fixed.** Retry restricted to `failed`/`partially_completed`/`rejected` (else `409`), appends a fresh `queued` event, and the reducer resets run-derived state on `queued`. Regression-tested; verified end to end. |
| 5 | medium | Review restore could no-op if the saved review arrived before streamed fields seeded the rows. | **Fixed.** Saved review is held in state and merged deterministically into row derivation regardless of arrival order. |
| 6 | medium | In-memory stores (jobs/events/reviews/uploads) are unbounded. | **Partially addressed.** Upload sessions now expire (1h TTL prune on init). Job/event retention is a documented demo limit (stores are swappable behind interfaces — spec 0002 AC-9). |
| 7 | low | Cancel endpoint returned `200 {ok:false}` for non-cancellable states. | **Fixed.** Returns `409` with a reason enum (`already_terminal` / `no_active_run`). Verified: cancel-on-terminal → `409`. |
| 8 | low | A11y: non-semantic clickable review rows; overlay boxes labeled by `title` only. | **Fixed.** Review rows are `role="button"` + keyboard handlers + `aria-pressed`/`aria-label`; overlay boxes gained `aria-label`/`aria-pressed`. |

## Confirmed correct-but-subtle (kept as-is)

- SSE replay ordering: `since()` then `subscribe()` in one synchronous turn is race-free in the single-threaded runtime — no gaps without a buffer.
- Event-log index math: 1-based ids + `slice(lastEventId)` replays `N+1…` correctly for `Last-Event-ID=N`.
- Terminal stream close avoids idle heartbeat-only connections and leaked subscriptions/intervals.

## Post-fix verification

`lint` · `typecheck` · `format:check` · **22 tests** · `build` all green; runtime checks passed for traversal rejection, cancel `409`, and retry reset.

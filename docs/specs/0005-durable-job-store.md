# 0005. Durable job store on embedded SQLite

**Date**: 2026-09-21
**Status**: Proposed

## Summary

Today jobs, documents, the event log, and reviews live only in memory on `globalThis`, so a restart wipes every job and review 0001 flagged the stores as unbounded. This decision moves all four behind an embedded SQLite file on local disk (via `better-sqlite3`), so a job survives a restart, its events replay from `Last-Event-ID` with no gaps, and review edits stick. The in memory store stays available and becomes the test and ephemeral host path, chosen by a flag. This slice adds durability only. Bounding the stores (retention) is tracked as follow up, so the review finding is narrowed but not fully closed.

## Context

The console's whole reliability story rests on one claim: the append only event log is the durable source of truth, and the SSE connection is a disposable cursor over it (spec 0002). That claim is currently false. `src/jobs/runtime.ts` holds the job store, document store, event log, and reviews as plain in memory structures stashed on `globalThis` to survive dev hot reloads. A real process restart loses everything. The `EventLogStore`, `JobStore`, and `DocumentStore` interfaces already exist (spec 0002, AC-9) precisely so this swap is possible without touching callers; reviews are the exception, kept as a raw `Map` in `runtime.ts` with no interface.

Two forces shape the change. First, spec 0001 (AC-1, AC-2) requires the core demo to run with one command, no external services, and no keys, so any datastore that needs a separate server to start is out for the default path. Second, the app also deploys to Vercel, where the filesystem is read only except `/tmp` and different requests can hit different isolates, so true single process durability is a local or self hosted property, not a serverless one.

The consequence of not deciding: the event log stays in memory, the streaming reliability story cannot be demonstrated across a restart, and review 0001's unbounded store finding stays fully open. This is the first of three interview evidence slices, and it is the one that turns "I built an SSE demo" into "I built a durable async system that replays after a restart".

## Requirements

**User stories**:
- As an operator, I want a job and its progress to survive a server restart, so I can close the console, come back, and keep reviewing where I left off.
- As an operator, I want my edits and approvals to still be there after a restart, so a crash never costs me review work.
- As a developer, I want tests and ephemeral hosts to run against a clean in memory store, so durability never leaks state between test runs.

**Acceptance criteria** (the contract, each independently checkable):
- **AC-1**: Jobs, documents, the event log, and reviews all persist to an embedded SQLite database file on local disk, and the durable store is the default when the app runs normally.
- **AC-2**: On a single process deployment, after a restart a prior job reopens and its events replay from a given `Last-Event-ID` in order, with no gaps and no duplicates, then follow live. (Serverless is best effort per isolate, see AC-9.)
- **AC-3**: Per job event ids stay monotonic, 1 based, and gap free under concurrent appends to the same job.
- **AC-4**: Review edits and approvals survive a restart and restore into the console.
- **AC-5**: On a single process deployment, after a restart reconnect and cancel land on the same truth: a cancelled job stays cancelled, and a reconnect replays the same log rather than a fresh one.
- **AC-6**: The active store is selected at runtime. Durable is the default; a feature flag or `NODE_ENV=test` forces the in memory store, so tests and ephemeral hosts get a clean store.
- **AC-7**: If the database cannot be opened or the migration fails, the job, document, and review routes return a 5xx with a structured log that names the database path and the error, and there is no silent fall back to the in memory store (only the explicit flag or `NODE_ENV=test` selects in memory).
- **AC-8**: The data root is resolved by one shared `resolveDataDir()` helper with precedence `DATA_DIR` env, then the serverless default (`/tmp`), then local `.data`. Both uploads and the database use it; the database lives at `<dataDir>/doc-intel.db`.
- **AC-9**: A retry is distinguishable in the durable log: the fresh `queued` event carries an `attempt` number in its `data`, so prior run rows stay in the append only history without ambiguity.
- **AC-10**: True cross restart durability is scoped to single process (local or self hosted) deployments. On serverless the store is best effort per isolate, and this limit is stated in the app's honest limits, not hidden.

## Options considered

### Option 1: Embedded SQLite file behind the existing store interfaces

Back the `EventLogStore`, `JobStore`, `DocumentStore`, and a new `ReviewStore` with a single SQLite file opened by `better-sqlite3`. Events, jobs, documents, and reviews become tables; the live SSE fan out stays an in process listener set that fires after each write.

**Pros**:
- Zero external services: a file on disk satisfies spec 0001's one command, no keys constraint.
- Real relational structure (foreign keys, a composite primary key for gap free replay) with ACID writes; `better-sqlite3` is synchronous, which matches the existing append then notify path and the single process worker model.
- Slots straight into the interfaces spec 0002 already defined for exactly this swap.

**Cons**:
- A native module (`better-sqlite3`) needs a compile step on install and in CI.
- SQLite is single writer; fine for one process, not for many isolates (the Vercel limit).

### Option 2: Append only JSONL files per job on disk

Write each job's events as lines in a per job file, reusing the `readJson`/`writeJson` disk helpers already in `storage.ts`. No new dependency.

**Pros**:
- No native module; reuses an existing, understood disk pattern.
- Append only maps naturally to the event log.

**Cons**:
- Jobs, documents, and reviews still need their own ad hoc file formats and hand rolled indexing; no queries, no constraints, no transactions.
- Gap free monotonic ids under concurrent appends become a manual file locking problem, exactly the class of race review 0001 already had to fix once for uploads.
- Reinvents a database badly; more code to get right than Option 1.

### Option 3: Redis or Postgres behind the interface

Run a real server backed store, off by default, used only when a connection string is present.

**Pros**:
- Production grade durability and concurrency; a genuine multi isolate answer.

**Cons**:
- Violates spec 0001's no external services default: the demo would need a server running to be durable, or would silently fall back and prove nothing.
- Operational weight far beyond a single operator portfolio demo; not something the slice needs to carry.

## Decision

**Chosen option**: Option 1: embedded SQLite file behind the existing store interfaces.

Back all four stores with one SQLite database opened by `better-sqlite3`, keep the live SSE fan out as an in process listener that fires after each persisted write, and select durable versus in memory at runtime by flag. This is a fix that finally honors the interfaces spec 0002 already shipped.

## Rationale

SQLite is the boring, proven choice that fits every force in Context. It needs no server, so spec 0001's one command demo still holds (basis: spec 0001, AC-1). It gives real transactions, so the gap free monotonic id that review 0001 confirmed for the in memory log survives the move: the append runs in one write transaction computing `COALESCE(MAX(id),0)+1` for that job, and SQLite serializes writers so no two appends collide (basis: SQLite single writer transaction semantics). The store interfaces from spec 0002 (AC-9) mean callers, the SSE endpoint, and the UI do not change, so this is genuinely a swap, not a rewrite (basis: spec 0002, AC-9, stores behind interfaces).

`better-sqlite3` over an async driver because the code path is synchronous today (append then notify listeners in one turn), and a synchronous driver keeps the race free append atomic without threading promises through the worker (basis: your AGENTS.md, the event log as source of truth). Node's built in `node:sqlite` is rejected only because CI pins Node 20 and it needs Node 22 (basis: `.github/workflows/ci.yml`, `node-version: 20`); it is the natural future move once the Node floor rises.

The engineer chose durability only for this slice. Retention stays a follow up, so review 0001's unbounded finding is narrowed (the store is now real and swappable) but not closed; that is an honest, stated limit rather than a hidden one.

## Feature design

**Data model sketch** (the coherent target; one migration realizes it):

- `documents`: `id` TEXT PK, `name` TEXT, `size_bytes` INTEGER, `page_count` INTEGER nullable, `storage_key` TEXT, `created_at` TEXT.
- `jobs`: `id` TEXT PK, `document_id` TEXT FK -> `documents.id`, `kind` TEXT (`digitise` | `extract`), `status` TEXT, `last_event_id` INTEGER, `created_at` TEXT, `updated_at` TEXT, `error` TEXT nullable. Index on `document_id`.
- `job_events`: `job_id` TEXT FK -> `jobs.id`, `id` INTEGER (per job, 1 based), `type` TEXT, `ts` TEXT, `data` TEXT (JSON, zod validated on read). **PRIMARY KEY (`job_id`, `id`)** so `since(jobId, lastEventId)` is an indexed range scan.
- `reviews`: `job_id` TEXT PK FK -> `jobs.id`, `fields` TEXT (JSON array of `{ key, value, approved }`), `submitted_at` TEXT.

Cardinality: one document has many jobs; one job has many events and at most one review.

**State transitions**: unchanged from spec 0002 (`queued -> processing -> completed | partially_completed | failed | rejected`, plus `cancelled`). This spec persists the transitions, it does not change them.

**API surface**: no HTTP surface changes. The existing routes (`/api/jobs`, `/api/jobs/:id/events`, `/cancel`, `/retry`, `/review`) keep their contracts; only the store behind `src/jobs/runtime.ts` changes. Two behaviors are pinned that were previously implicit: `POST /api/jobs/:id/review` is a full replace upsert keyed by `job_id` (latest `submitted_at` wins), and on a store open or migration failure these routes return 5xx (AC-7).

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| append event | per job `id` (1 based, monotonic) | `COALESCE(MAX(id),0)+1` for that `job_id`, computed and inserted inside one `BEGIN IMMEDIATE` write transaction |
| append event | `ts` | server clock at write |
| append event | `jobs.last_event_id` | written in the same transaction as the event insert (`job_events` is canonical; the column is a cache kept consistent in that transaction) |
| retry | `attempt` number on the fresh `queued` event | `MAX(attempt) + 1` over that job's prior `queued` events, in the retry transaction |
| replay after restart | events after `Last-Event-ID` | `job_events` range scan `WHERE job_id = ? AND id > ?` ordered by `id` |
| replay after restart | `pages_processed` / `total_pages` | rebuilt by the existing client reducer from the replayed events (no new stored source) |
| open store at boot | data root + database path | `resolveDataDir()` (precedence `DATA_DIR` env, then serverless `/tmp`, then `.data`), database at `<dataDir>/doc-intel.db` |
| select store | durable vs in memory | feature flag (`src/flags/`) and `NODE_ENV`; in memory when the flag is off or `NODE_ENV=test` |
| restore review | saved `fields` + approvals | `reviews.fields` JSON for that `job_id` |

**Key invariants**:
- The event log is append only. No update or delete of a `job_events` row in this slice.
- `(job_id, id)` is unique and contiguous from 1 per job; a replay never returns a gap or a duplicate.
- `job_events` is the source of truth. `jobs.last_event_id` and `jobs.status` are written in the same transaction as the event that changes them, so a read never sees a job row that disagrees with its log.
- The append runs under `BEGIN IMMEDIATE` (a write lock taken up front), so two concurrent appends to one job serialize rather than collide.
- The live fan out fires only after the transaction commits, so a subscriber never sees an event that a rollback or a restart would lose.
- One `better-sqlite3` connection and one listener set are shared per process via a `globalThis` singleton (the same pattern `runtime.ts` uses today), so an append in one route module notifies a subscriber registered in the SSE route module. Node runtime only.
- Exactly one store implementation is active per process, chosen once at startup.
- Event `data` is JSON parsed and zod validated on read; an invalid row fails the request with a structured error rather than being skipped, so a corrupt row never silently corrupts a timeline.

**Security model**: unchanged. Single operator local demo, no auth (auth stays deferred in scope). The database file sits under the same local data root as uploads; no new external surface.

**Configuration required**:
- `DATA_DIR`: data root for the database file and the upload bytes, resolved by the shared `resolveDataDir()` (precedence `DATA_DIR`, then serverless `/tmp`, then `.data`). DB at `<dataDir>/doc-intel.db`.
- A feature flag in `src/flags/` (for example `FEATURE_DURABLE_STORE`, default on) to force the in memory store off for tests and ephemeral hosts. `NODE_ENV=test` also forces in memory.
- SQLite pragmas set at open: `journal_mode=WAL`, `synchronous=NORMAL`, `busy_timeout` (so a lock waits instead of throwing), `foreign_keys=ON`.
- Schema version tracked with `PRAGMA user_version`, so the migration runs once and is idempotent under parallel cold starts.

**Critical test scenarios** (each maps to an AC):
- Happy path: create a job, drive it to a terminal status, restart the store, reopen the job, replay from `Last-Event-ID` gap free, verifies **AC-1**, **AC-2**.
- Failure case: many concurrent appends to one job keep ids 1 based and contiguous, verifies **AC-3**.
- Restart persistence: submit a review, restart, the edits and approvals restore, verifies **AC-4**.
- Reconnect and cancel: cancel a job, restart, a reconnect replays the same log and the job is still cancelled, verifies **AC-5**.
- Store selection: with the flag off (or `NODE_ENV=test`) the in memory store is active and writes nothing to disk, verifies **AC-6**.
- Corrupt open: pointing at an unreadable or corrupt DB file logs a structured error naming the path and refuses to start, verifies **AC-7**.

## Build plan

Ordered as a Tracer Bullet: prove the event log end to end through SQLite first (the load bearing store for the streaming story), then thicken with the other three stores.

1. Add `better-sqlite3`, a `src/jobs/db.ts` that opens `<DATA_DIR>/doc-intel.db` (reusing the `storage.ts` data root resolver), applies the WAL pragmas, and fails loud on a corrupt or unopenable file, satisfies **AC-7**, **AC-8**.
2. Create the one migration for the confirmed schema (`documents`, `jobs`, `job_events`, `reviews`) run on first open, satisfies **AC-1**.
3. Implement `SqliteEventLog` behind `EventLogStore`: transactional append computing `COALESCE(MAX(id),0)+1` per job, `since()` as an indexed range scan, and an in process listener set that fires after the write, satisfies **AC-2**, **AC-3**.
4. Implement `SqliteJobStore` and `SqliteDocumentStore` behind their interfaces, satisfies **AC-1**.
5. Introduce a `ReviewStore` interface and a `SqliteReviewStore`, and move the raw `reviews` Map in `runtime.ts` behind it, satisfies **AC-1**, **AC-4**.
6. Add a store selector in `runtime.ts` and a `src/flags/` flag: durable by default, in memory when the flag is off or `NODE_ENV=test`, satisfies **AC-6**.
7. Verify restart behavior end to end: reopen a prior job, replay from `Last-Event-ID`, and confirm a cancelled job stays cancelled across a restart, satisfies **AC-2**, **AC-5**.

## Consequences

**Positive**:
- The event log becomes a genuine durable source of truth, so the streaming reliability story holds across a restart, the point of this slice.
- Review 0001's unbounded in memory finding is narrowed to a real, swappable store with a stated retention follow up.
- The store interfaces from spec 0002 finally have a second implementation, proving the seam was real.

**Negative / tradeoffs**:
- `better-sqlite3` is a native module, so install and CI now carry a compile step and its platform build risk.
- Durability is real only on a local or self hosted single process. On Vercel it is best effort per isolate (`/tmp`), so the same app is honest but weaker in that environment, a limit that must be documented, not hidden.
- Retention is still open: the tables grow unbounded until the follow up lands.

**Neutral**:
- One new migration and a new `ReviewStore` interface; callers and the UI are untouched.
- WAL mode leaves `-wal` and `-shm` sidecar files beside the database.

## Follow-up

- [ ] Add retention/bounding (prune jobs and their events past a count or age) to fully close review 0001's unbounded store finding. This is scope feature Measured performance's neighbor, not this slice.
- [ ] Document the Vercel best effort durability limit in the README notes and honest limits section.
- [ ] Revisit `node:sqlite` (drop the `better-sqlite3` native module) once the Node floor moves to 22.

## Migration plan

**Strategy**: feature flagged swap, no data migration. The in memory stores hold nothing durable, so there is no live data to transform; the risk is code behavior, not data movement.
**Phases**:
1. Land the SQLite implementations behind the existing interfaces with the flag defaulting to in memory, so nothing changes at runtime yet.
2. Flip the default to durable once the restart replay and concurrency tests pass.
**Rollback**: set the store flag to in memory (or `NODE_ENV=test`), which restores the exact prior behavior with one env change and no deploy.
**Risks**: the `better-sqlite3` native build failing on a CI or host platform; a stale `-wal` file after an unclean shutdown (WAL recovery handles this on next open, but a corrupt file triggers the AC-7 fail loud path).

## References

**Project sources**:
- `AGENTS.md`: the event log is the source of truth; the SSE connection is a disposable cursor over it.
- Spec [0002](0002-data-model-job-event-protocol.md): the `EventLogStore`/`JobStore`/`DocumentStore` interfaces and AC-9 (store swappable without touching callers), the job status and event vocabulary.
- Spec [0001](0001-stack-and-architecture.md): the demo runs with one command, no external services, no keys; in memory store accepted as a swappable demo limit.
- Review [0001](../reviews/0001-senior-review.md): unbounded in memory stores flagged; the upload append race fixed with a per session lock (the same race class this spec avoids with a transaction).
- `src/upload/storage.ts`: the existing `DATA_DIR` style data root resolution (`.data` locally, `/tmp` on serverless) this spec reuses.
- `.github/workflows/ci.yml`: Node 20 pin, which rules out `node:sqlite`.

**Practices & standards**:
- Design for failure: fail loud on a corrupt store rather than run half working.
- Feature flags as the deployment mechanism for a change with a non trivial blast radius (instant rollback by flag).
- Single write transaction for gap free monotonic ids (serialized writers).
- One migration realizes a coherent target schema; append only event log.

# 0005. Durable job store on embedded SQLite

**Date**: 2026-09-21
**Status**: In Progress

_Decision history: [rationale.md](rationale.md)._

## Summary

Today jobs, documents, the event log, and reviews live only in memory on `globalThis`, so a restart wipes every job and review 0001 flagged the stores as unbounded. This decision moves all four behind an embedded SQLite file on local disk (via `better-sqlite3`), so a job survives a restart, its events replay from `Last-Event-ID` with no gaps, and review edits stick. The in memory store stays available and becomes the test and ephemeral host path, chosen by a flag. This slice adds durability only. Bounding the stores (retention) is tracked as follow up, so the review finding is narrowed but not fully closed.

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

## Decision

**Chosen option**: Option 1: embedded SQLite file behind the existing store interfaces.

Back all four stores with one SQLite database opened by `better-sqlite3`, keep the live SSE fan out as an in process listener that fires after each persisted write, and select durable versus in memory at runtime by flag. This is a fix that finally honors the interfaces spec 0002 already shipped.

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
- Failure case: many concurrent appends to one job keep ids 1 based and contiguous, and `jobs.last_event_id` equals `MAX(job_events.id)` afterward, verifies **AC-3**.
- Restart persistence: submit a review, restart, the edits and approvals restore, verifies **AC-4**.
- Reconnect and cancel: cancel a job, restart, a reconnect replays the same log and the job is still cancelled, verifies **AC-5**.
- Store selection: with the flag off (or `NODE_ENV=test`) the in memory store is active and writes nothing to disk, verifies **AC-6**.
- Open failure: pointing at an unreadable or corrupt DB makes the job routes return 5xx with a structured log naming the path, and it does not fall back to in memory, verifies **AC-7**.
- Retry segmentation: retry a failed job, the new `queued` event carries `attempt = 2` and the prior run's rows are still present, verifies **AC-9**.
- Corrupt row: a `job_events` row with unparseable `data` fails the read request with a structured error rather than being skipped, verifies the read time validation invariant.

## Build plan

Ordered as a Tracer Bullet: prove the event log end to end through SQLite first (the load bearing store for the streaming story), then thicken with the other three stores.

1. [x] Add a shared `resolveDataDir()` helper (precedence `DATA_DIR`, serverless `/tmp`, `.data`) and refactor `storage.ts` to use it, so uploads and the DB share one data root, satisfies **AC-8**.
2. [x] Add `better-sqlite3` and a `src/jobs/db.ts` that opens `<dataDir>/doc-intel.db` on a `globalThis` singleton, applies the WAL pragmas and `busy_timeout`, and on an open or migration failure surfaces a structured error that makes job routes return 5xx with no in memory fall back, satisfies **AC-7**.
3. [x] Create the idempotent migration for the confirmed schema (`documents`, `jobs`, `job_events`, `reviews`) guarded by `PRAGMA user_version`, satisfies **AC-1**.
4. [x] Implement `SqliteEventLog` behind `EventLogStore`: `BEGIN IMMEDIATE` append computing `COALESCE(MAX(id),0)+1` per job and writing `jobs.last_event_id` in the same transaction, `since()` as an indexed range scan, JSON+zod validation on read, and a shared in process listener set that fires only after commit, satisfies **AC-2**, **AC-3**.
5. [x] Implement `SqliteJobStore` and `SqliteDocumentStore` behind their interfaces, with `status`/`last_event_id` updates sharing the event transaction, satisfies **AC-1**.
6. [x] Carry the retry `attempt` number on the fresh `queued` event `data` so runs are distinguishable in the append only log, satisfies **AC-9**.
7. [x] Introduce a `ReviewStore` interface and a `SqliteReviewStore` (full replace upsert by `job_id`), and move the raw `reviews` Map in `runtime.ts` behind it, satisfies **AC-1**, **AC-4**.
8. [x] Add a store selector in `runtime.ts` and a `src/flags/` flag: durable by default, in memory when the flag is off or `NODE_ENV=test`, satisfies **AC-6**.
9. [x] Verify restart behavior end to end on a single process: reopen a prior job, replay from `Last-Event-ID`, confirm a cancelled job stays cancelled, and document the serverless best effort limit, satisfies **AC-2**, **AC-5**, **AC-10**.

## Consequences

**Positive**:
- The event log becomes a genuine durable source of truth, so the streaming reliability story holds across a restart, the point of this slice.
- Review 0001's unbounded in memory finding is narrowed to a real, swappable store with a stated retention follow up.
- The store interfaces from spec 0002 finally have a second implementation, proving the seam was real.

**Negative / tradeoffs**:
- `better-sqlite3` is a native module, so install and CI now carry a compile step and its platform build risk. Pin the version and rely on the existing Node 20 CI to catch a bad build.
- Durability is real only on a local or self hosted single process. On Vercel each isolate has its own memory fan out and its own `/tmp`, so a subscriber in one isolate can miss an append in another; the app states this rather than implying cross isolate durability.
- Writing `jobs.status`/`last_event_id` in the event transaction couples the two writes; the payoff is that a read never sees a job row that disagrees with its log, but every status change now goes through that transaction.
- Retention is still open: the tables grow unbounded until the follow up lands.

**Neutral**:
- One idempotent migration and a new `ReviewStore` interface; callers and the UI are untouched.
- WAL mode leaves `-wal` and `-shm` sidecar files beside the database; on `/tmp` with a disk quota these can fail, which surfaces through the AC-7 error path rather than silent loss.

## Follow-up

- [ ] Add retention/bounding (prune jobs and their events past a count or age) to fully close review 0001's unbounded store finding. This is scope feature Measured performance's neighbor, not this slice.
- [x] Document the Vercel best effort durability limit in the README notes and honest limits section.
- [ ] Revisit `node:sqlite` (drop the `better-sqlite3` native module) once the Node floor moves to 22.

## Migration plan

**Strategy**: feature flagged swap, no data migration. The in memory stores hold nothing durable, so there is no live data to transform; the risk is code behavior, not data movement.
**Phases**:
1. Land the SQLite implementations behind the existing interfaces with the flag defaulting to in memory, so nothing changes at runtime yet.
2. Flip the default to durable once the restart replay and concurrency tests pass.
**Rollback**: set the store flag to in memory (or `NODE_ENV=test`), which restores the exact prior behavior with one env change and no deploy.
**Risks**: the `better-sqlite3` native build failing on a CI or host platform; a stale `-wal` file after an unclean shutdown (WAL recovery handles this on next open, but a corrupt file triggers the AC-7 fail loud path).

# 0005 rationale · Durable job store on embedded SQLite

## Context

The console's whole reliability story rests on one claim: the append only event log is the durable source of truth, and the SSE connection is a disposable cursor over it (spec 0002). That claim is currently false. `src/jobs/runtime.ts` holds the job store, document store, event log, and reviews as plain in memory structures stashed on `globalThis` to survive dev hot reloads. A real process restart loses everything. The `EventLogStore`, `JobStore`, and `DocumentStore` interfaces already exist (spec 0002, AC-9) precisely so this swap is possible without touching callers; reviews are the exception, kept as a raw `Map` in `runtime.ts` with no interface.

Two forces shape the change. First, spec 0001 (AC-1, AC-2) requires the core demo to run with one command, no external services, and no keys, so any datastore that needs a separate server to start is out for the default path. Second, the app also deploys to Vercel, where the filesystem is read only except `/tmp` and different requests can hit different isolates, so true single process durability is a local or self hosted property, not a serverless one.

The consequence of not deciding: the event log stays in memory, the streaming reliability story cannot be demonstrated across a restart, and review 0001's unbounded store finding stays fully open. This is the first of three interview evidence slices, and it is the one that turns "I built an SSE demo" into "I built a durable async system that replays after a restart".

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

## Rationale

SQLite is the boring, proven choice that fits every force in Context. It needs no server, so spec 0001's one command demo still holds (basis: spec 0001, AC-1). It gives real transactions, so the gap free monotonic id that review 0001 confirmed for the in memory log survives the move: the append runs in one write transaction computing `COALESCE(MAX(id),0)+1` for that job, and SQLite serializes writers so no two appends collide (basis: SQLite single writer transaction semantics). The store interfaces from spec 0002 (AC-9) mean callers, the SSE endpoint, and the UI do not change, so this is genuinely a swap, not a rewrite (basis: spec 0002, AC-9, stores behind interfaces).

`better-sqlite3` over an async driver because the code path is synchronous today (append then notify listeners in one turn), and a synchronous driver keeps the race free append atomic without threading promises through the worker (basis: your AGENTS.md, the event log as source of truth). Node's built in `node:sqlite` is rejected only because CI pins Node 20 and it needs Node 22 (basis: `.github/workflows/ci.yml`, `node-version: 20`); it is the natural future move once the Node floor rises.

The engineer chose durability only for this slice. Retention stays a follow up, so review 0001's unbounded finding is narrowed (the store is now real and swappable) but not closed; that is an honest, stated limit rather than a hidden one.

## References

**Project sources**:
- `AGENTS.md`: the event log is the source of truth; the SSE connection is a disposable cursor over it.
- Spec [0002](../0002-data-model-job-event-protocol.md): the `EventLogStore`/`JobStore`/`DocumentStore` interfaces and AC-9 (store swappable without touching callers), the job status and event vocabulary.
- Spec [0001](../0001-stack-and-architecture.md): the demo runs with one command, no external services, no keys; in memory store accepted as a swappable demo limit.
- Review [0001](../../reviews/0001-senior-review.md): unbounded in memory stores flagged; the upload append race fixed with a per session lock (the same race class this spec avoids with a transaction).
- `src/upload/storage.ts`: the existing `DATA_DIR` style data root resolution (`.data` locally, `/tmp` on serverless) this spec reuses.
- `.github/workflows/ci.yml`: Node 20 pin, which rules out `node:sqlite`.

**Practices & standards**:
- Design for failure: fail loud on a corrupt store rather than run half working.
- Feature flags as the deployment mechanism for a change with a non trivial blast radius (instant rollback by flag).
- Single write transaction for gap free monotonic ids (serialized writers).
- One migration realizes a coherent target schema; append only event log.

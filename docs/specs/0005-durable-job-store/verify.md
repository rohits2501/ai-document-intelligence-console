# Verify: Durable job store · spec 0005 · updated 2026-09-21

_Steps derived from spec 0005 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual

- [ ] `npm run dev`, upload a document, start a job, wait until it finishes. Confirm `.data/doc-intel.db` exists. Stop the server, start it again, open the same job. Expect the job, document, and timeline to return. → AC-1
- [ ] On that reopened job, reconnect the stream with a `Last-Event-ID` in the middle of the log. Expect events after that id, in order, with no gaps and no duplicates, then live follow. → AC-2
- [ ] Submit a review (edit a field, approve it). Restart the server. Open the job. Expect the same field values and approvals. → AC-4
- [ ] Cancel a running job. Restart. Reopen and reconnect. Expect the cancelled event still in the log and the job still terminal failed (cancel maps to failed status). Expect the same log, not a fresh one. → AC-5
- [ ] Retry that failed job. Expect a new `queued` event with `data.attempt === 2`, and the prior run's events still present. → AC-9
- [ ] Confirm the README Notes & honest limits section states single process durability and Vercel best effort per isolate. → AC-10
- [ ] Watch progress (`pages_processed` / `total_pages`) after replay. Expect the client reducer to rebuild it from replayed events, not from a stored snapshot. → value source: replay after restart

## Commands

- [ ] Create a job, then `sqlite3 .data/doc-intel.db "SELECT id FROM job_events WHERE job_id = '<id>' ORDER BY id"`. Expect 1, 2, 3, … with no gaps. `jobs.last_event_id` equals `MAX(job_events.id)` for that job. → AC-3 · value source: append event id and `last_event_id`
- [ ] `sqlite3 .data/doc-intel.db "SELECT json_extract(data, '$.attempt') FROM job_events WHERE job_id = '<id>' AND type = 'queued' ORDER BY id"`. First queued is 1. After retry, next queued is 2. → AC-9 · value source: retry attempt
- [ ] `FEATURE_DURABLE_STORE=false npm run dev`, create a job, confirm no writes to `doc-intel.db` (or the file is unchanged). `NODE_ENV=test npm test` uses the in memory store. → AC-6 · value source: select store
- [ ] Point `DATA_DIR` at a path where `doc-intel.db` cannot be opened (for example a directory occupying that name). `GET /api/jobs` and `POST /api/jobs/:id/review` return 5xx. Logs include `db_path` and the error. The process does not fall back to memory. → AC-7 · value source: open store at boot
- [ ] Set `DATA_DIR` to a temp directory, create a job, confirm the db is `<DATA_DIR>/doc-intel.db` and uploads land under `<DATA_DIR>/uploads`. → AC-8 · value source: data root + database path
- [ ] Corrupt one `job_events.data` value to invalid JSON. Fetch `/api/jobs/:id/events`. Expect 5xx naming the corrupt row, not a skipped event. → read time validation invariant
- [ ] `npm run typecheck` and `npm run build` pass with `better-sqlite3` linked as a native module. → AC-1

## Acceptance-criteria coverage

- AC-1 covered by happy path persist + db file on disk
- AC-2 covered by restart replay from `Last-Event-ID`
- AC-3 covered by contiguous id query and `last_event_id` match
- AC-4 covered by review restore after restart
- AC-5 covered by cancel then restart reconnect
- AC-6 covered by flag off / `NODE_ENV=test`
- AC-7 covered by unreadable db 5xx
- AC-8 covered by `DATA_DIR` layout
- AC-9 covered by retry `attempt` on queued
- AC-10 covered by README honest limits
- Value sourcing: event id, `ts` (ISO at write), `last_event_id`, retry `attempt`, replay range scan, reducer rebuilt progress, `resolveDataDir()`, store selector, review `fields` JSON

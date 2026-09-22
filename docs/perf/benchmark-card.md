# Perf card: naive vs current vs enhanced

Fixture: `job_perf-bench` (200 page frames, 500 fields, 2000 events, 102 jobs).
HUD read after SSE replay settled. Current ran on `:3003` (existing `:3000` was left alone). Naive `:3001`. Enhanced `:3002`.

## Job console (`/jobs/job_perf-bench`)

| Metric | Naive | Current (Virtual on PDF only) | Enhanced (Virtual + Pacer) |
| --- | --- | --- | --- |
| Pages in DOM | 200 / 200 | 3 / 200 | 3 / 200 |
| Review rows in DOM | 500 / 500 | 500 / 500 | 14 / 500 |
| Event rows in DOM | 2000 / 2000 | 2000 / 2000 | 25 / 2000 |
| SSE apply count | 2000 / 2000 | 2000 / 2000 | 2000 / 2000 |
| JS heap (Chromium `performance.memory`) | 90.0 MB | 53.9 MB | 49.6 MB |

## Home list (`/`)

| Metric | Naive | Current | Enhanced |
| --- | --- | --- | --- |
| Job rows in DOM | 102 / 102 | 102 / 102 | 13 / 102 |
| Polls while visible (~4s) | 7 | 7 | 7 |

Polls while hidden: not timed in the browser (the tab stayed visible). Enhanced `JobList` returns before fetch when `document.hidden` is true. Current and naive keep `setInterval` running.

## What the card says to merge

Wins (real DOM / memory gaps):

1. Keep viewer Virtual (already on current: 200 pages down to 3).
2. Virtualize ReviewList (500 down to 14).
3. Virtualize the event timeline (2000 down to 25).
4. Virtualize JobList once the list is tens of jobs (102 down to 13).
5. Pacer on JobList poll so a hidden tab stops fetching.

SSE apply count stayed 2000 in every build because the HUD counts events, not React commits. Enhanced still batches those applies into 16ms windows. Keep the batcher. Upload throttle was not exercised (no upload in this run). Cheap enough to take with Pacer.

Do not merge the naive viewer.

## Post merge check (main on `:3003`)

After porting the wins, the same fixture read: pages 3/200, review 14/500, events 25/2000, heap 49.4 MB. That matches the enhanced column.

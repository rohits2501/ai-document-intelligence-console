# 0006. Merge Virtual list windows and Pacer poll control

**Date**: 2026-09-22
**Status**: Accepted
**Mode**: ENHANCEMENT

## Summary

The bench card in `docs/perf/benchmark-card.md` compared a naive mount everything build, current main (Virtual only on PDF pages), and an enhanced fork (more Virtual plus Pacer). Viewer Virtual already wins. Review rows, the event timeline, and the home job list still mount every item on main. This spec merges the proven windows and a hidden tab pause on the job list poll. The naive build stays off main.

## Requirements

**User stories**:
- As an operator opening the 200 page fixture, I want only nearby pages, review rows, and events in the DOM so the console stays usable.
- As an operator with a long job list, I want the home list to window rows the same way.
- As an operator who leaves the tab in the background, I want job list polling to stop until the tab is visible again.

**Acceptance criteria**:
- **AC-1**: On `job_perf-bench`, the viewer keeps page DOM count near the overscan window (not 200).
- **AC-2**: ReviewList windows rows with `@tanstack/react-virtual`. HUD `reviewMounted` stays far below 500 on the fixture.
- **AC-3**: Event timeline windows rows. HUD `eventsMounted` stays far below 2000 on the fixture.
- **AC-4**: JobList windows rows. HUD `jobsMounted` stays far below 102 on the seeded list.
- **AC-5**: JobList polling uses Pacer throttle and does not fetch while `document.hidden` is true.
- **AC-6**: SSE replay applies events through a Pacer batcher (about one flush per frame) without dropping events.
- **AC-7**: Perf HUD and `npm run seed:perf` stay available behind `NEXT_PUBLIC_PERF_HUD`.
- **AC-8**: Failed PDF load still renders page frames so the fixture (and any corrupt file) keeps the overlay story.

## Decision

**Chosen option**: Merge the enhanced windows and Pacer poll or batch helpers onto main. Leave the naive renderer in the `bench/naive` worktree only.

## Build plan

1. Port virtual ReviewList, timeline, and JobList from the enhanced worktree (AC-2, AC-3, AC-4, AC-1 already shipped).
2. Port Pacer JobList poll and SSE batcher (AC-5, AC-6).
3. Keep HUD, seeder, `JobStore.put`, and the failed PDF frame path (AC-7, AC-8).
4. Add `@tanstack/react-pacer` on main.

## Consequences

Operators on the fixture see a small DOM. Screen readers see the window, not every row. Estimate sizes can jump if a review row wraps; overscan covers the usual case. Pacer is a new dependency, small next to pdf.js.

## Follow-up

Re-run the HUD on the same fixture after merge. `/check verify` against this spec. Do not merge `bench/naive`.

## Rationale

Numbers live in `docs/perf/benchmark-card.md`. Current already beat naive on pages (3 vs 200) and heap (54 MB vs 90 MB). Enhanced then cut review (14 vs 500), events (25 vs 2000), and jobs (13 vs 102).

# 0007 · Measured performance

**Status**: Accepted
**Date**: 2026-10-18
**Mode**: ENHANCEMENT
**Feature**: Measured performance (scope #16)

## Summary

Hold performance as a number the build can refuse. The number is gzipped first-load JavaScript per page, the same figure `next build` prints. The document viewer also has a ceiling on the deferred pdf.js chunk and on the static worker, because those bytes are the real cost of showing a page and they are not in the first-load column.

Rendering ceilings for the 200-page fixture stay on the perf HUD. They are a different number from the bundle, and they are not a CI gate. Core Web Vitals use the published "good" thresholds and are logged in the browser when a session crosses one. They are not a measured baseline and they are not a CI gate.

## Requirements

- AC-1: `npm run build` fails when a page's gzipped first-load JS exceeds its ceiling in `perf/budgets.json`.
- AC-2: A new app page with no ceiling fails the build. A ceiling whose page disappeared fails the build.
- AC-3: The gated byte count matches the First Load JS column of `next build` (level-9 gzip).
- AC-4: The pdf.js client chunk and `public/pdf.worker.min.mjs` have their own ceilings, separate from first-load JS.
- AC-5: The perf HUD reports when a live snapshot exceeds the rendering ceilings. An empty snapshot does not fail.
- AC-6: A session that crosses a Core Web Vitals "good" threshold logs one structured warning. No collector is required.

## Decision

| Concern | Choice | Why |
|---|---|---|
| CI gate | Gzipped first-load JS per app page | It is deterministic, it is the number Next already prints, and it is the cost before the page can hydrate. |
| Ceiling policy | Measured bytes, rounded up to 1 KiB, plus 8 KiB | Tight enough that a new dependency fails. Loose enough that a small component does not. Raising it is a deliberate edit to `perf/budgets.json`. |
| Route handlers | Not gated | They are not a document the browser loads. |
| pdf.js | Marker match on `globalThis.pdfjsLib` inside `.next/static/chunks` | The chunk hash changes every build. The source string does not. Summing every hit means a second copy also counts. |
| pdf worker | Gzip of `public/pdf.worker.min.mjs` | It is the large transfer, and it is a stable path. |
| Rendering | Ceilings in `src/perf/field-budgets.ts`, compared by the HUD | The fixture was already measured. A browser lab in CI would be noisy. The unit test locks the enhanced shape as inside the ceilings and the naive shape as outside. |
| Web vitals | LCP 2500, INP 200, CLS 0.1, client log only | These are the standard "good" bars. Claiming a measured field baseline would be false. |

## Out of scope

- Lighthouse in CI. The lab score moves with the machine. The gzip number does not.
- A vendor collector for vitals or errors.
- Shrinking the current numbers. This slice records them and gates growth. Moving the number is a later change.

## Pointers

- Gate: `perf/budgets.json`, `scripts/check-bundle-budget.mjs`
- Field ceilings: `src/perf/field-budgets.ts`
- Write-up: [budgets.md](../perf/budgets.md)
- Fixture measurements: [benchmark-card.md](../perf/benchmark-card.md)

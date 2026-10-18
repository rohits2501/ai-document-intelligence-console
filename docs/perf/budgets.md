# Performance budgets

The number this app holds is **gzipped JavaScript**. `npm run build` runs the check after Next finishes (`postbuild`). A production build fails when a route is over its ceiling, a budgeted route disappears, or a new page ships with no ceiling.

The byte count is the same one `next build` prints as **First Load JS**: level-9 gzip of the client chunks for that page. Route handlers are not gated. They are not a document the browser loads.

Ceilings started as the measured size, rounded up to the next KiB, plus 8 KiB. That slack covers a small component. It does not cover a new dependency. Raise `maxBytes` in the same change that grows the route, and say why in the PR. `baselineBytes` is the measurement the ceiling was set from. It is not the gate.

## First-load JS

| Route | Baseline | Ceiling |
|---|---:|---:|
| `/` | 125.0 kB (125045) | 134.1 kB (134144) |
| `/jobs/[id]` | 128.1 kB (128147) | 137.2 kB (137216) |
| `/_not-found` | 88.3 kB (88302) | 97.3 kB (97280) |

Home is the page an operator loads before they can do anything. The job console is 3 kB more. pdf.js is not in that number.

## Viewer JS, loaded after first paint

| What | Baseline | Ceiling |
|---|---:|---:|
| pdf.js chunk (deferred, matched by `globalThis.pdfjsLib`) | 88.8 kB (88776) | 97.3 kB (97280) |
| `public/pdf.worker.min.mjs` | 437.9 kB (437925) | 446.5 kB (446464) |

The worker is the large transfer. It is a static file, so its ceiling does not move when a React component changes.

## Rendering ceilings

These are not a CI gate. The perf HUD (`NEXT_PUBLIC_PERF_HUD=true`) compares a live snapshot to them and marks a breach. The numbers sit above the enhanced 200-page fixture and below the naive mount-everything run. See [benchmark-card.md](benchmark-card.md).

| Surface | Enhanced fixture | Ceiling |
|---|---:|---:|
| Pages in the DOM | 3 / 200 | 12 |
| Review rows in the DOM | 14 / 500 | 40 |
| Event rows in the DOM | 25 / 2000 | 80 |
| Job rows in the DOM | 13 / 102 | 32 |
| JS heap | 49.4 MB | 80 MB |

Source: `src/perf/field-budgets.ts`.

## Web vitals

LCP 2500 ms, INP 200 ms, CLS 0.1. These are the Core Web Vitals "good" thresholds, not a measured baseline. A session that crosses one logs a structured `web-vital over budget` warning in the browser. There is no collector behind it.

## Commands

```bash
npm run build        # production build, then the budget check
npm run perf:budget  # re-check the existing .next output
node scripts/check-bundle-budget.mjs --print
```

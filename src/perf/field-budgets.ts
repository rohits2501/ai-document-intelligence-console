/**
 * Field and rendering ceilings. These are not the CI bundle gate (that is perf/budgets.json).
 *
 * Web vitals use the Core Web Vitals "good" thresholds. The client logs a structured warning
 * when a real session exceeds one. They are not measured baselines.
 *
 * Rendering ceilings sit above the enhanced perf-fixture run (docs/perf/benchmark-card.md:
 * 3 pages, 14 review rows, 25 events, 13 jobs, ~50 MB heap) and below the naive mount-everything
 * run (200 / 500 / 2000 / 102 / 90 MB). A tall window still passes. Removing virtualization does not.
 */
export const webVitals = {
  LCP: 2500,
  INP: 200,
  CLS: 0.1,
} as const;

export const rendering = {
  pagesMountedMax: 12,
  reviewMountedMax: 40,
  eventsMountedMax: 80,
  jobsMountedMax: 32,
  heapBytesMax: 80 * 1024 * 1024,
} as const;

export interface VitalBreach {
  name: string;
  value: number;
  max: number;
}

const vitalLimits: Record<string, number> = webVitals;

export function vitalBreach(name: string, value: number): VitalBreach | null {
  const max = vitalLimits[name];
  if (typeof max !== "number" || !(value > max)) return null;
  return { name, value, max };
}

import type { PerfSnapshot } from "./store";
import { rendering } from "./field-budgets";

export interface RenderBreach {
  metric: "pages" | "review" | "events" | "jobs" | "heap";
  value: number;
  max: number;
}

/**
 * Compare a HUD snapshot to the rendering ceilings. Counts of 0 are "not measured yet"
 * (the surface is not mounted), so an empty home screen does not fail the heap-less snapshot.
 */
export function renderBreaches(snap: PerfSnapshot): RenderBreach[] {
  const checks: Array<[RenderBreach["metric"], number, number, number]> = [
    ["pages", snap.pagesMounted, rendering.pagesMountedMax, snap.pagesTotal],
    ["review", snap.reviewMounted, rendering.reviewMountedMax, snap.reviewTotal],
    ["events", snap.eventsMounted, rendering.eventsMountedMax, snap.eventsTotal],
    ["jobs", snap.jobsMounted, rendering.jobsMountedMax, snap.jobsTotal],
    ["heap", snap.heapUsed ?? 0, rendering.heapBytesMax, snap.heapUsed == null ? 0 : 1],
  ];
  const breaches: RenderBreach[] = [];
  for (const [metric, value, max, total] of checks) {
    if (total > 0 && value > max) breaches.push({ metric, value, max });
  }
  return breaches;
}

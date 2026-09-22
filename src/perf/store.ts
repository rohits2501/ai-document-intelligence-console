export interface PerfSnapshot {
  pagesMounted: number;
  pagesTotal: number;
  reviewMounted: number;
  reviewTotal: number;
  eventsMounted: number;
  eventsTotal: number;
  jobsMounted: number;
  jobsTotal: number;
  pollCount: number;
  lastPollAt: number | null;
  sseApplyCount: number;
  sseEventCount: number;
  heapUsed: number | null;
}

const empty: PerfSnapshot = {
  pagesMounted: 0,
  pagesTotal: 0,
  reviewMounted: 0,
  reviewTotal: 0,
  eventsMounted: 0,
  eventsTotal: 0,
  jobsMounted: 0,
  jobsTotal: 0,
  pollCount: 0,
  lastPollAt: null,
  sseApplyCount: 0,
  sseEventCount: 0,
  heapUsed: null,
};

let snap: PerfSnapshot = empty;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function getPerf(): PerfSnapshot {
  return snap;
}

export function subscribePerf(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function patchPerf(partial: Partial<PerfSnapshot>): void {
  snap = { ...snap, ...partial };
  emit();
}

export function recordPoll(): void {
  snap = { ...snap, pollCount: snap.pollCount + 1, lastPollAt: Date.now() };
  emit();
}

export function recordSseApply(n = 1): void {
  snap = { ...snap, sseApplyCount: snap.sseApplyCount + n };
  emit();
}

export function readHeapUsed(): number | null {
  const mem = (
    performance as Performance & { memory?: { usedJSHeapSize: number } }
  ).memory;
  return typeof mem?.usedJSHeapSize === "number" ? mem.usedJSHeapSize : null;
}

export function resetPerf(): void {
  snap = empty;
  emit();
}

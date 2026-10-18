"use client";

import { useEffect, useSyncExternalStore } from "react";
import { flags } from "@/flags";
import { PERF_JOB_ID } from "./ids";
import { renderBreaches } from "./render-budget";
import { getPerf, readHeapUsed, patchPerf, subscribePerf } from "./store";
import styles from "./hud.module.css";

const treatment = process.env.NEXT_PUBLIC_PERF_TREATMENT ?? "current";

function formatBytes(n: number | null): string {
  if (n == null) return "n/a";
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function age(ts: number | null): string {
  if (ts == null) return "never";
  return `${Math.max(0, Math.round((Date.now() - ts) / 1000))}s ago`;
}

export function PerfHud() {
  const snap = useSyncExternalStore(subscribePerf, getPerf, getPerf);
  const breaches = renderBreaches(snap);

  useEffect(() => {
    if (!flags.perfHud) return;
    const tick = () => patchPerf({ heapUsed: readHeapUsed() });
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, []);

  if (!flags.perfHud) return null;

  return (
    <aside className={styles.hud} aria-label="Performance HUD">
      <div className={styles.head}>
        <span>Perf HUD</span>
        <span>{treatment}</span>
      </div>
      <dl className={styles.grid}>
        <dt>pages DOM</dt>
        <dd>
          {snap.pagesMounted} / {snap.pagesTotal}
        </dd>
        <dt>review DOM</dt>
        <dd>
          {snap.reviewMounted} / {snap.reviewTotal}
        </dd>
        <dt>events DOM</dt>
        <dd>
          {snap.eventsMounted} / {snap.eventsTotal}
        </dd>
        <dt>jobs DOM</dt>
        <dd>
          {snap.jobsMounted} / {snap.jobsTotal}
        </dd>
        <dt>polls</dt>
        <dd>
          {snap.pollCount} ({age(snap.lastPollAt)})
        </dd>
        <dt>SSE apply</dt>
        <dd>
          {snap.sseApplyCount} / {snap.sseEventCount}
        </dd>
        <dt>heap</dt>
        <dd>{formatBytes(snap.heapUsed)}</dd>
        <dt>budget</dt>
        <dd className={breaches.length > 0 ? styles.over : undefined}>
          {breaches.length === 0 ? "ok" : breaches.map((breach) => breach.metric).join(" ")}
        </dd>
      </dl>
      <div className={styles.head} style={{ marginTop: "var(--space-2)", marginBottom: 0 }}>
        <a href={`/jobs/${PERF_JOB_ID}`} style={{ color: "var(--accent)" }}>
          Open fixture
        </a>
      </div>
    </aside>
  );
}

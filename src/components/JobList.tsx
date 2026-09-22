"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useThrottledCallback } from "@tanstack/react-pacer";
import { Panel, StatusBadge } from "@/ui";
import type { Job } from "@/jobs/types";
import { flags } from "@/flags";
import { patchPerf, recordPoll } from "@/perf/store";

const ROW = 56;

export function JobList() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const parentRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (typeof document !== "undefined" && document.hidden) return;
    try {
      const res = await fetch("/api/jobs");
      if (!res.ok) return;
      const data = (await res.json()) as { jobs: Job[] };
      if (flags.perfHud) recordPoll();
      setJobs(data.jobs);
    } catch {
      // ignore transient errors on the list poll
    }
  }, []);

  const poll = useThrottledCallback(load, { wait: 3000, leading: true });

  useEffect(() => {
    void poll();
    const id = window.setInterval(() => {
      if (!document.hidden) poll();
    }, 1000);
    const onVis = () => {
      if (!document.hidden) poll();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [poll]);

  const virtualizer = useVirtualizer({
    count: jobs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW,
    overscan: 6,
  });
  const mounted = virtualizer.getVirtualItems().length;

  useEffect(() => {
    if (!flags.perfHud) return;
    patchPerf({ jobsMounted: mounted, jobsTotal: jobs.length });
  }, [mounted, jobs.length]);

  return (
    <Panel title="Recent jobs" tourId="job-list" badge="Live">
      {jobs.length === 0 ? (
        <p style={{ color: "var(--text-muted)", margin: 0 }}>
          No jobs yet. Upload a document to start one.
        </p>
      ) : (
        <div
          ref={parentRef}
          style={{ height: 360, overflow: "auto" }}
        >
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              height: virtualizer.getTotalSize(),
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((item) => {
              const job = jobs[item.index];
              if (!job) return null;
              return (
                <li
                  key={job.id}
                  data-perf="job-row"
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${item.start}px)`,
                    paddingBottom: "var(--space-2)",
                  }}
                >
                  <Link
                    href={`/jobs/${job.id}`}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "var(--space-3)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      textDecoration: "none",
                      color: "var(--text)",
                    }}
                  >
                    <span style={{ fontSize: "var(--text-sm)" }}>{job.id}</span>
                    <StatusBadge status={job.status} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Panel>
  );
}

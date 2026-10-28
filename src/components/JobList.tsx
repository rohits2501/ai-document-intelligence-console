"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useThrottledCallback } from "@tanstack/react-pacer";
import { Button, Panel, StatusBadge, statusLabel } from "@/ui";
import { JOB_STATUSES, type Job, type JobStatus } from "@/jobs/types";
import { flags } from "@/flags";
import { patchPerf, recordPoll } from "@/perf/store";

const ROW = 72;

type ListedJob = Job & { documentName: string | null };
type LoadPhase = "loading" | "ready" | "error";
type StatusFilter = "all" | JobStatus;

export function JobList() {
  const [jobs, setJobs] = useState<ListedJob[]>([]);
  const [phase, setPhase] = useState<LoadPhase>("loading");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const parentRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (typeof document !== "undefined" && document.hidden) return;
    try {
      const res = await fetch("/api/jobs");
      if (!res.ok) {
        setPhase((current) => (current === "loading" ? "error" : current));
        return;
      }
      const data = (await res.json()) as { jobs: ListedJob[] };
      if (flags.perfHud) recordPoll();
      setJobs(data.jobs);
      setPhase("ready");
    } catch {
      // A later poll failure keeps the rows already on screen.
      setPhase((current) => (current === "loading" ? "error" : current));
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

  const visible = useMemo(
    () => (filter === "all" ? jobs : jobs.filter((job) => job.status === filter)),
    [jobs, filter],
  );

  const virtualizer = useVirtualizer({
    count: visible.length,
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
    <Panel title="Recent jobs" tourId="job-list">
      {phase === "loading" ? (
        <p role="status" style={{ color: "var(--text-muted)", margin: 0 }}>
          Loading jobs…
        </p>
      ) : null}

      {phase === "error" ? (
        <p role="alert" style={{ color: "var(--danger)", margin: 0 }}>
          Could not load jobs. The list will try again.
        </p>
      ) : null}

      {phase === "ready" && jobs.length === 0 ? (
        <p style={{ color: "var(--text-muted)", margin: 0 }}>
          No jobs yet. Upload a document to start one.
        </p>
      ) : null}

      {phase === "ready" && jobs.length > 0 ? (
        <div style={{ display: "grid", gap: "var(--space-3)" }}>
          <div
            role="group"
            aria-label="Filter by status"
            style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}
          >
            <Button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>
              All
            </Button>
            {JOB_STATUSES.map((status) => (
              <Button
                key={status}
                type="button"
                aria-pressed={filter === status}
                onClick={() => setFilter(status)}
              >
                {statusLabel(status)}
              </Button>
            ))}
          </div>

          {visible.length === 0 ? (
            <p style={{ color: "var(--text-muted)", margin: 0 }}>No jobs with this status.</p>
          ) : (
            <div ref={parentRef} style={{ height: 360, overflow: "auto" }}>
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
                  const job = visible[item.index];
                  if (!job) return null;
                  const name = job.documentName ?? job.id;
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
                          justifyContent: "center",
                          alignItems: "center",
                          gap: "var(--space-3)",
                          padding: "var(--space-3)",
                          border: "1px solid var(--border)",
                          borderRadius: "var(--radius-sm)",
                          textDecoration: "none",
                          color: "var(--text)",
                        }}
                      >
                        <span style={{ display: "grid", gap: 2, minWidth: 0 }}>
                          <span
                            title={name}
                            style={{
                              fontSize: "var(--font-size-sm)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {name}
                          </span>
                          <span
                            style={{
                              fontSize: "var(--font-size-xs)",
                              color: "var(--text-muted)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {job.id}
                          </span>
                        </span>
                        <StatusBadge status={job.status} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      ) : null}
    </Panel>
  );
}

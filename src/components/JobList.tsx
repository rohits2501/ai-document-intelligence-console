"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Panel, StatusBadge } from "@/ui";
import type { Job } from "@/jobs/types";

export function JobList() {
  const [jobs, setJobs] = useState<Job[]>([]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch("/api/jobs");
        if (!res.ok) return;
        const data = (await res.json()) as { jobs: Job[] };
        if (active) setJobs(data.jobs);
      } catch {
        // ignore transient errors on the list poll
      }
    };
    void load();
    const t = setInterval(load, 3000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);

  return (
    <Panel title="Recent jobs" tourId="job-list" badge="Live">
      {jobs.length === 0 ? (
        <p style={{ color: "var(--text-muted)", margin: 0 }}>
          No jobs yet. Upload a document to start one.
        </p>
      ) : (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "grid",
            gap: "var(--space-2)",
          }}
        >
          {jobs.map((job) => (
            <li key={job.id}>
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
          ))}
        </ul>
      )}
    </Panel>
  );
}

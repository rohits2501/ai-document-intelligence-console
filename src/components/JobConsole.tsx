"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Button, Panel, ProgressBar, StatusBadge } from "@/ui";
import { useJobStream } from "@/jobs/useJobStream";
import { isTerminal } from "@/jobs/types";
import { flags } from "@/flags";
import { ReviewList } from "./ReviewList";
import { ErrorBoundary } from "./ErrorBoundary";
import { Walkthrough } from "@/walkthrough/Walkthrough";
import { jobTour } from "@/walkthrough/tours";

// react-pdf is browser-only; load the viewer without SSR.
const DocumentViewer = dynamic(() => import("./DocumentViewer").then((m) => m.DocumentViewer), {
  ssr: false,
  loading: () => <div style={{ padding: 16, color: "var(--text-muted)" }}>Loading viewer…</div>,
});

/**
 * The job console: streams live status from the event log over SSE, shows progress, a live event
 * timeline, the document with extraction overlays, and extracted fields as they arrive.
 * Cancel/retry go through the HTTP control plane.
 */
export function JobConsole({ jobId }: { jobId: string }) {
  const { state, connected } = useJobStream(jobId);
  const [selected, setSelected] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [documentId, setDocumentId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/jobs/${jobId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (active && data?.job) setDocumentId(data.job.documentId);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [jobId]);

  const terminal = isTerminal(state.status);
  const total = state.totalPages ?? 0;

  async function cancel() {
    setActing(true);
    await fetch(`/api/jobs/${jobId}/cancel`, { method: "POST" }).catch(() => {});
    setActing(false);
  }
  async function retry() {
    setActing(true);
    await fetch(`/api/jobs/${jobId}/retry`, { method: "POST" }).catch(() => {});
    setActing(false);
  }

  return (
    <div style={{ display: "grid", gap: "var(--space-4)" }}>
      <div
        data-tour="job-status"
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
      >
        <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center" }}>
          <Link href="/" style={{ textDecoration: "none" }}>
            ← Back
          </Link>
          <h1 style={{ margin: 0, fontSize: "var(--text-xl)" }}>Job {jobId}</h1>
          <StatusBadge status={state.status} />
          <span
            style={{
              fontSize: "var(--text-xs)",
              color: connected ? "var(--status-completed)" : "var(--text-muted)",
            }}
          >
            {connected ? "● live" : "○ reconnecting"}
          </span>
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <Button variant="danger" disabled={acting || terminal} onClick={cancel}>
            Cancel
          </Button>
          <Button disabled={acting || !terminal} onClick={retry}>
            Retry
          </Button>
        </div>
      </div>

      <Panel title="Progress" tourId="job-progress" badge="Live SSE">
        <div style={{ display: "grid", gap: "var(--space-2)" }}>
          <ProgressBar value={state.pagesProcessed} max={total || 1} />
          <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
            {total > 0
              ? `Processed ${state.pagesProcessed} / ${total} pages`
              : "Waiting for the job to start…"}
          </div>
          {state.error && (
            <div role="alert" style={{ color: "var(--status-failed)", fontSize: "var(--text-sm)" }}>
              {state.error}
            </div>
          )}
        </div>
      </Panel>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "var(--space-4)" }}>
        <Panel title="Document" tourId="document-viewer" badge="Virtualized">
          {documentId ? (
            <ErrorBoundary label="The document viewer">
              <DocumentViewer
                documentId={documentId}
                pageCountHint={total || 4}
                fields={state.fields}
                selectedKey={selected}
                onSelectField={setSelected}
              />
            </ErrorBoundary>
          ) : (
            <p style={{ color: "var(--text-muted)", margin: 0 }}>Resolving document…</p>
          )}
        </Panel>

        <Panel
          title={`Review fields (${state.fields.length})`}
          tourId="review-list"
          badge="Human review"
        >
          <ReviewList
            jobId={jobId}
            fields={state.fields}
            selectedKey={selected}
            onSelect={setSelected}
          />
          {state.failedKeys.length > 0 && (
            <p
              style={{
                color: "var(--status-partial)",
                fontSize: "var(--text-xs)",
                marginBottom: 0,
              }}
            >
              Provider flagged for review: {state.failedKeys.join(", ")}
            </p>
          )}
        </Panel>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)" }}>
        <Panel title="Event timeline" tourId="event-timeline">
          <ol
            style={{
              margin: 0,
              paddingLeft: "var(--space-4)",
              display: "grid",
              gap: "var(--space-1)",
            }}
          >
            {state.events
              .filter((e) => e.type !== "heartbeat")
              .map((e) => (
                <li key={e.id} style={{ fontSize: "var(--text-sm)" }}>
                  <span style={{ color: "var(--text-muted)" }}>#{e.id}</span> {e.type}
                  {e.data.page ? ` (page ${e.data.page}/${e.data.totalPages ?? "?"})` : ""}
                </li>
              ))}
          </ol>
        </Panel>

        {flags.diagnostics ? (
          <Panel title="Diagnostics" tourId="diagnostics-panel" badge="Observability">
            <dl
              style={{
                margin: 0,
                display: "grid",
                gridTemplateColumns: "auto 1fr",
                gap: "var(--space-1) var(--space-3)",
                fontSize: "var(--text-sm)",
              }}
            >
              <Diag label="job_id" value={jobId} />
              <Diag label="document_id" value={documentId ?? "—"} />
              <Diag label="stream" value={connected ? "connected" : "reconnecting"} />
              <Diag label="last_event_id" value={String(state.lastEventId)} />
              <Diag label="events" value={String(state.events.length)} />
              <Diag label="status" value={state.status} />
            </dl>
          </Panel>
        ) : null}
      </div>

      <Walkthrough tour={jobTour} />
    </div>
  );
}

function Diag({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt style={{ color: "var(--text-muted)" }}>{label}</dt>
      <dd style={{ margin: 0, wordBreak: "break-all", fontFamily: "ui-monospace, monospace" }}>
        {value}
      </dd>
    </>
  );
}

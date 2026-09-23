import type { Tour } from "./types";

/**
 * The two guided tours. Targets reference `data-tour` attributes on real surfaces, so the tour
 * stays in sync with the UI: if a region is removed, its step self-skips at runtime (the
 * Walkthrough component drops steps whose target cannot be found, e.g. the Diagnostics panel when
 * its feature flag is off).
 */

export const homeTour: Tour = {
  id: "home",
  name: "Console tour",
  steps: [
    {
      id: "welcome",
      target: null,
      badge: "Demo mode",
      title: "Welcome to the Document Intelligence Console",
      body: "A quick tour of how an operator drops a document, watches it process live, and reviews the extracted fields. Use Next and Back, or press Escape to skip.",
    },
    {
      id: "upload",
      target: "upload-panel",
      badge: "Resumable upload",
      title: "Drop a document to start a job",
      body: "Large files upload in chunks with live progress. An interrupted upload resumes from the last committed offset instead of restarting.",
      placement: "right",
    },
    {
      id: "jobs",
      target: "job-list",
      badge: "Live list",
      title: "Track every job",
      body: "Recent jobs refresh here with a status that is never color alone: a dot plus a text label. Open one to watch it stream.",
      placement: "left",
    },
  ],
};

export const jobTour: Tour = {
  id: "job-console",
  name: "Job console tour",
  steps: [
    {
      id: "status",
      target: "job-status",
      badge: "At a glance",
      title: "Job status and controls",
      body: "The current status and the cancel or retry controls live here. Status maps directly to the document AI job lifecycle, including partially completed.",
      placement: "bottom",
    },
    {
      id: "progress",
      target: "job-progress",
      badge: "Live stream",
      title: "Progress streams over SSE",
      body: "Progress and events arrive over a Server-Sent Events stream backed by an append only event log. Reconnects replay from the last event id, so nothing is missed.",
      placement: "bottom",
    },
    {
      id: "viewer",
      target: "document-viewer",
      badge: "Virtualized",
      title: "The document viewer",
      body: "Pages render on demand and are virtualized, so a large document stays responsive. Selecting a field highlights its bounding box on the page.",
      placement: "right",
    },
    {
      id: "review",
      target: "review-list",
      badge: "Human in the loop",
      title: "Review and approve fields",
      body: "Each extracted field carries a confidence score and its source. Edit a value, then approve it. Your review persists across reloads.",
      placement: "left",
    },
    {
      id: "timeline",
      target: "event-timeline",
      badge: "Audit trail",
      title: "The event timeline",
      body: "Every event that shaped this job, in order. This log is the source of truth; the live stream is just a disposable cursor over it.",
      placement: "left",
    },
    {
      id: "diagnostics",
      target: "diagnostics-panel",
      badge: "Observability",
      title: "Diagnostics",
      body: "Correlation ids (request, job, document) and the live stream state, for debugging a real incident. This panel is behind a feature flag.",
      placement: "top",
    },
  ],
};

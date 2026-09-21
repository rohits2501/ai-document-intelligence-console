import type { EventLogStore } from "./event-log";
import type { JobStore } from "./store";
import type { DocumentRecord, JobEventType } from "./types";
import { statusForEvent } from "./types";
import {
  getExtractionProvider,
  ProviderAbortError,
  type ExtractSchema,
  type ProviderEvent,
} from "@/extraction";
import { log, span } from "@/telemetry";

/**
 * The job worker. Runs a provider, maps ProviderEvents to JobEvents appended to the log, and keeps
 * the Job record's status/lastEventId in sync. Honors an AbortSignal for cancel (spec 0002 AC-2/4).
 *
 * The worker is separate from the SSE endpoint: it appends to the durable log, and any number of
 * SSE cursors read from that log. This is what makes reconnect and multi-tab fall out for free.
 */
export interface WorkerDeps {
  jobs: JobStore;
  eventLog: EventLogStore;
}

const controllers = new Map<string, AbortController>();

export function cancelJob(jobId: string): boolean {
  const controller = controllers.get(jobId);
  if (!controller) return false;
  controller.abort();
  return true;
}

function appendEvent(
  deps: WorkerDeps,
  jobId: string,
  type: JobEventType,
  data: Parameters<EventLogStore["append"]>[2] = {},
) {
  const event = deps.eventLog.append(jobId, type, data);
  const status = statusForEvent(type);
  deps.jobs.update(jobId, {
    lastEventId: event.id,
    ...(status ? { status } : {}),
    ...(type === "failed" || type === "rejected" ? { error: data.error ?? "job failed" } : {}),
  });
  return event;
}

export async function runJob(
  deps: WorkerDeps,
  jobId: string,
  doc: DocumentRecord,
  opts: { kind: "digitise" | "extract"; schema?: ExtractSchema } = { kind: "extract" },
): Promise<void> {
  const controller = new AbortController();
  controllers.set(jobId, controller);
  const provider = getExtractionProvider();

  appendEvent(deps, jobId, "processing", { message: `provider=${provider.name}` });

  const stream =
    opts.kind === "digitise"
      ? provider.digitise(doc, controller.signal)
      : provider.extract(doc, opts.schema ?? defaultSchema(), controller.signal);

  try {
    await span("job.run", { job_id: jobId, document_id: doc.id }, async () => {
      for await (const ev of stream) {
        mapProviderEvent(deps, jobId, ev);
      }
    });
  } catch (err) {
    // A cancel aborts the shared signal; providers surface that as ProviderAbortError (mock) or a
    // DOMException "AbortError" (real fetch-based provider). Treat all of these as cancellation, not
    // a generic failure, so cancel semantics/status stay accurate.
    const aborted =
      err instanceof ProviderAbortError ||
      (err instanceof DOMException && err.name === "AbortError") ||
      controller.signal.aborted;
    if (aborted) {
      appendEvent(deps, jobId, "cancelled", { message: "cancelled by operator" });
      log.warn("job:cancelled", { job_id: jobId, document_id: doc.id });
    } else {
      const error = err instanceof Error ? err.message : String(err);
      appendEvent(deps, jobId, "failed", { error });
      log.error("job:failed", { job_id: jobId, document_id: doc.id, error });
    }
  } finally {
    controllers.delete(jobId);
  }
}

function mapProviderEvent(deps: WorkerDeps, jobId: string, ev: ProviderEvent) {
  switch (ev.type) {
    case "page_processed":
      appendEvent(deps, jobId, "page_processed", { page: ev.page, totalPages: ev.totalPages });
      break;
    case "extraction_started":
      appendEvent(deps, jobId, "extraction_started", {});
      break;
    case "partial_result":
      appendEvent(deps, jobId, "partial_result", { fields: ev.fields });
      break;
    case "completed":
      appendEvent(deps, jobId, "completed", {});
      break;
    case "partially_completed":
      appendEvent(deps, jobId, "partially_completed", { failed: ev.failed });
      break;
    case "failed":
      appendEvent(deps, jobId, "failed", { error: ev.error });
      break;
  }
}

function defaultSchema(): ExtractSchema {
  return [
    { key: "document_type", description: "The kind of document" },
    { key: "invoice_number", description: "Invoice identifier" },
    { key: "invoice_date", description: "Date on the document" },
    { key: "vendor_name", description: "Name of the vendor" },
    { key: "total_amount", description: "Total amount due" },
    { key: "gstin", description: "GST identification number" },
  ];
}

import { NextResponse } from "next/server";
import { runtime as store } from "@/jobs/runtime";
import { runJob } from "@/jobs/worker";
import type { JobStatus } from "@/jobs/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Only a failed run is worth retrying; a completed job has nothing to redo.
const RETRYABLE: readonly JobStatus[] = ["failed", "partially_completed", "rejected"];

/**
 * Control plane: retry a failed/partial/rejected job. Appends a fresh `queued` event onto the SAME
 * event log after the last event id, so a reconnecting client sees continuity AND the client job
 * state machine resets (progress/fields/errors) on that queued event before the new run streams.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const job = store.jobs.get(params.id);
  if (!job) return NextResponse.json({ error: "unknown job" }, { status: 404 });
  if (!RETRYABLE.includes(job.status)) {
    return NextResponse.json(
      { ok: false, reason: "not retryable", status: job.status },
      { status: 409 },
    );
  }
  const doc = store.documents.get(job.documentId);
  if (!doc) return NextResponse.json({ error: "unknown document" }, { status: 404 });

  // Fresh queued event marks the retry boundary; the reducer treats it as a state reset.
  const event = store.eventLog.append(job.id, "queued", { message: `retry of ${job.id}` });
  store.jobs.update(job.id, { status: "queued", error: null, lastEventId: event.id });
  void runJob({ jobs: store.jobs, eventLog: store.eventLog }, job.id, doc, { kind: job.kind });

  return NextResponse.json({ ok: true });
}

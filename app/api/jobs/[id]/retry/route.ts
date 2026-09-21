import { NextResponse } from "next/server";
import { runtime as store } from "@/jobs/runtime";
import { runJob } from "@/jobs/worker";
import { isTerminal } from "@/jobs/types";
import { log } from "@/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Control plane: retry a terminal (failed/partial) job. Appends a fresh run onto the SAME event
 * log after the last event id, so a reconnecting client sees continuity (spec 0002).
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const job = store.jobs.get(params.id);
  if (!job) return NextResponse.json({ error: "unknown job" }, { status: 404 });
  if (!isTerminal(job.status)) {
    return NextResponse.json({ ok: false, reason: "not terminal", status: job.status });
  }
  const doc = store.documents.get(job.documentId);
  if (!doc) return NextResponse.json({ error: "unknown document" }, { status: 404 });

  store.jobs.update(job.id, { status: "queued", error: null });
  log.info("job:retry", { job_id: job.id, document_id: doc.id });
  void runJob({ jobs: store.jobs, eventLog: store.eventLog }, job.id, doc, { kind: job.kind });

  return NextResponse.json({ ok: true });
}

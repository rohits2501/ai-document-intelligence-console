import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runtime as store } from "@/jobs/runtime";
import { runJob } from "@/jobs/worker";
import { JobKind } from "@/jobs/types";
import { log, newRequestId } from "@/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateJob = z.object({
  documentId: z.string(),
  kind: JobKind.default("extract"),
});

/** Create a job for a document and start the worker. Appends `queued`, returns { jobId }. */
export async function POST(req: NextRequest) {
  const request_id = newRequestId();
  const body = await req.json().catch(() => ({}));
  const parsed = CreateJob.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const doc = store.documents.get(parsed.data.documentId);
  if (!doc) {
    return NextResponse.json({ error: "unknown documentId" }, { status: 404 });
  }

  const job = store.jobs.create(doc.id, parsed.data.kind);
  store.eventLog.append(job.id, "queued", { message: doc.name });
  store.jobs.update(job.id, { lastEventId: store.eventLog.latestId(job.id) });
  log.info("job:created", { request_id, job_id: job.id, document_id: doc.id });

  // Fire and forget: the worker appends to the durable log; SSE cursors read from it.
  void runJob({ jobs: store.jobs, eventLog: store.eventLog }, job.id, doc, {
    kind: parsed.data.kind,
  });

  return NextResponse.json({ jobId: job.id }, { status: 201 });
}

/** List jobs (newest first) for the console. */
export async function GET() {
  return NextResponse.json({ jobs: store.jobs.list() });
}

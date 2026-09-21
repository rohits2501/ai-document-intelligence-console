import { NextResponse } from "next/server";
import { runtime as store } from "@/jobs/runtime";
import { cancelJob } from "@/jobs/worker";
import { isTerminal } from "@/jobs/types";
import { log } from "@/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Control plane: cancel a running job. Never carried on the stream (spec 0002). */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const job = store.jobs.get(params.id);
  if (!job) return NextResponse.json({ error: "unknown job" }, { status: 404 });
  if (isTerminal(job.status)) {
    return NextResponse.json({ ok: false, reason: "already terminal", status: job.status });
  }
  const cancelled = cancelJob(params.id);
  log.info("job:cancel-requested", { job_id: params.id });
  return NextResponse.json({ ok: cancelled });
}

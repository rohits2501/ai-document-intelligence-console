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
    return NextResponse.json(
      { ok: false, reason: "already_terminal", status: job.status },
      { status: 409 },
    );
  }
  const cancelled = cancelJob(params.id);
  log.info("job:cancel-requested", { job_id: params.id, ok: cancelled });
  if (!cancelled) {
    // No live worker to abort (race: finished or not yet started). Signal explicitly, don't imply success.
    return NextResponse.json(
      { ok: false, reason: "no_active_run", status: job.status },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runtime as store } from "@/jobs/runtime";
import { log } from "@/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ReviewBody = z.object({
  fields: z.array(z.object({ key: z.string(), value: z.string(), approved: z.boolean() })),
});

/** Persist an operator's review of extracted fields (approvals + edited values). */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const job = store.jobs.get(params.id);
  if (!job) return NextResponse.json({ error: "unknown job" }, { status: 404 });

  const parsed = ReviewBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const record = {
    jobId: params.id,
    fields: parsed.data.fields,
    submittedAt: new Date().toISOString(),
  };
  store.reviews.set(params.id, record);
  log.info("job:reviewed", {
    job_id: params.id,
    document_id: job.documentId,
    approved: parsed.data.fields.filter((f) => f.approved).length,
  });
  return NextResponse.json({ ok: true, review: record }, { status: 201 });
}

/** Fetch a saved review so the console can restore approval state. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const review = store.reviews.get(params.id) ?? null;
  return NextResponse.json({ review });
}

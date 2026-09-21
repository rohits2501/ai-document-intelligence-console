import { NextResponse } from "next/server";
import { runtime as store } from "@/jobs/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Fetch a single job (used by the console to resolve the document for the viewer). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const job = store.jobs.get(params.id);
  if (!job) return NextResponse.json({ error: "unknown job" }, { status: 404 });
  const document = store.documents.get(job.documentId) ?? null;
  return NextResponse.json({ job, document });
}

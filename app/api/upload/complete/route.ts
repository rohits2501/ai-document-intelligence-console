import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { deleteSession, getSession } from "@/upload/uploads-store";
import { currentSize } from "@/upload/storage";
import { runtime as store } from "@/jobs/runtime";
import { DocumentRecord } from "@/jobs/types";
import { log } from "@/telemetry";
import { withStore } from "@/jobs/store-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Complete = z.object({ uploadId: z.string() });

/** Finalize a chunked upload into a Document once all bytes are committed. */
export async function POST(req: NextRequest) {
  return withStore(async () => {
    const body = await req.json().catch(() => ({}));
    const parsed = Complete.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const session = await getSession(parsed.data.uploadId);
    if (!session) return NextResponse.json({ error: "unknown uploadId" }, { status: 404 });

    const committed = await currentSize(session.storageKey);
    if (session.size > 0 && committed !== session.size) {
      return NextResponse.json(
        { error: "incomplete", committed, expected: session.size },
        { status: 409 },
      );
    }

    const id = `doc_${crypto.randomUUID()}`;
    const doc = DocumentRecord.parse({
      id,
      name: session.name,
      sizeBytes: committed,
      pageCount: null,
      storageKey: session.storageKey,
      createdAt: new Date().toISOString(),
    });
    store.documents.put(doc);
    await deleteSession(session.uploadId);
    log.info("upload:complete-chunked", { document_id: id });
    return NextResponse.json({ document: doc }, { status: 201 });
  });
}

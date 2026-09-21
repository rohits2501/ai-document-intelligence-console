import { NextRequest, NextResponse } from "next/server";
import { runtime as store } from "@/jobs/runtime";
import { writeWhole } from "@/upload/storage";
import { DocumentRecord } from "@/jobs/types";
import { log, newRequestId } from "@/telemetry";
import { withStore } from "@/jobs/store-errors";

export const runtime = "nodejs"; // Node runtime for fs access
export const dynamic = "force-dynamic";

/**
 * Whole-file upload (Slice 1). The Resumable chunked upload slice adds a chunked variant; this
 * endpoint stays for small files and the demo happy path.
 */
export async function POST(req: NextRequest) {
  return withStore(async () => {
    const request_id = newRequestId();
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "expected a file field" }, { status: 400 });
    }

    const id = `doc_${crypto.randomUUID()}`;
    const storageKey = `${id}__${sanitize(file.name)}`;
    const bytes = Buffer.from(await file.arrayBuffer());
    await writeWhole(storageKey, bytes);

    const doc = DocumentRecord.parse({
      id,
      name: file.name,
      sizeBytes: bytes.byteLength,
      pageCount: null,
      storageKey,
      createdAt: new Date().toISOString(),
    });
    store.documents.put(doc);
    log.info("upload:complete", { request_id, document_id: id });

    return NextResponse.json({ document: doc }, { status: 201 });
  });
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

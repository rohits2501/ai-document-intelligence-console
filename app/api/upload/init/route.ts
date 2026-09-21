import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { uploads, pruneStaleUploads } from "@/upload/uploads-store";
import { currentSize } from "@/upload/storage";
import { log, newRequestId } from "@/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A resumable uploadId must be a server-shaped opaque token; never free-form (path-traversal guard).
const UPLOAD_ID = /^up_[0-9a-f-]{36}$/;

const Init = z.object({
  name: z.string().min(1),
  size: z.number().int().nonnegative(),
  uploadId: z.string().regex(UPLOAD_ID).optional(), // client may pass a prior id to resume
});

/** Begin (or resume) a chunked upload. Returns the uploadId and the current committed offset. */
export async function POST(req: NextRequest) {
  const request_id = newRequestId();
  pruneStaleUploads(60 * 60 * 1000); // drop upload sessions older than 1h
  const body = await req.json().catch(() => ({}));
  const parsed = Init.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const uploadId = parsed.data.uploadId ?? `up_${crypto.randomUUID()}`;
  const existing = uploads.get(uploadId);
  const storageKey = existing?.storageKey ?? `${uploadId}__${sanitize(parsed.data.name)}`;

  if (!existing) {
    uploads.set(uploadId, {
      uploadId,
      storageKey,
      name: parsed.data.name,
      size: parsed.data.size,
      createdAt: new Date().toISOString(),
    });
  }

  const offset = await currentSize(storageKey);
  log.info("upload:init", { request_id, message: uploadId });
  return NextResponse.json({ uploadId, offset }, { status: 201 });
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

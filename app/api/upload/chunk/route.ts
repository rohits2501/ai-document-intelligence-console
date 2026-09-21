import { NextRequest, NextResponse } from "next/server";
import { getSession, withUploadLock } from "@/upload/uploads-store";
import { appendChunk, currentSize } from "@/upload/storage";
import { log } from "@/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Append one chunk at a given offset. The client sends chunks sequentially; the server only accepts
 * a chunk whose offset matches the current committed size, so a duplicate or out-of-order retry is
 * rejected with the authoritative offset for the client to resume from. The offset check + append
 * run under a per-upload lock so concurrent PUTs cannot both commit at the same offset.
 */
export async function PUT(req: NextRequest) {
  const uploadId = req.nextUrl.searchParams.get("uploadId");
  const offsetParam = req.nextUrl.searchParams.get("offset");
  if (!uploadId || offsetParam === null) {
    return NextResponse.json({ error: "uploadId and offset required" }, { status: 400 });
  }
  const session = await getSession(uploadId);
  if (!session) {
    return NextResponse.json({ error: "unknown uploadId" }, { status: 404 });
  }

  const offset = Number.parseInt(offsetParam, 10);
  const buf = Buffer.from(await req.arrayBuffer());

  try {
    return await withUploadLock(uploadId, async () => {
      const committed = await currentSize(session.storageKey);
      if (offset !== committed) {
        // idempotent resume: tell the client where we actually are
        return NextResponse.json({ error: "offset mismatch", expected: committed }, { status: 409 });
      }
      await appendChunk(session.storageKey, buf);
      const received = await currentSize(session.storageKey);
      return NextResponse.json({ received });
    });
  } catch (err) {
    log.error("upload:chunk", {
      error: err instanceof Error ? err.message : String(err),
      uploadId,
      offset,
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "chunk write failed" },
      { status: 500 },
    );
  }
}

/** Query how many bytes are committed, so a client can resume after a reload. */
export async function GET(req: NextRequest) {
  const uploadId = req.nextUrl.searchParams.get("uploadId");
  if (!uploadId) return NextResponse.json({ error: "uploadId required" }, { status: 400 });
  const session = await getSession(uploadId);
  if (!session) return NextResponse.json({ error: "unknown uploadId" }, { status: 404 });
  const offset = await currentSize(session.storageKey);
  return NextResponse.json({ offset, size: session.size });
}

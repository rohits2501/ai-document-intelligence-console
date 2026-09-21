import { NextResponse } from "next/server";
import { runtime as store } from "@/jobs/runtime";
import { readWhole } from "@/upload/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Stream a stored document's bytes to the viewer. Demo-only local disk read. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const doc = store.documents.get(params.id);
  if (!doc) return NextResponse.json({ error: "unknown document" }, { status: 404 });
  try {
    const bytes = await readWhole(doc.storageKey);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": contentTypeForName(doc.name),
        "Content-Disposition": `inline; filename="${encodeURIComponent(doc.name)}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch {
    return NextResponse.json({ error: "file not found" }, { status: 404 });
  }
}

/** Map a stored document's extension to a browser-renderable content type. */
function contentTypeForName(name: string): string {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  switch (ext) {
    case "pdf":
      return "application/pdf";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    default:
      return "application/octet-stream";
  }
}

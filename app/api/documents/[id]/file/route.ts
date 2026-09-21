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
    const isPdf = doc.name.toLowerCase().endsWith(".pdf");
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": isPdf ? "application/pdf" : "application/octet-stream",
        "Content-Disposition": `inline; filename="${encodeURIComponent(doc.name)}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch {
    return NextResponse.json({ error: "file not found" }, { status: 404 });
  }
}

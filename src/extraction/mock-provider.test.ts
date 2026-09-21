import { describe, it, expect } from "vitest";
import { MockExtractionProvider } from "./mock-provider";
import type { ProviderEvent, ExtractSchema } from "./provider";
import type { DocumentRecord } from "@/jobs/types";

const schema: ExtractSchema = [
  { key: "document_type", description: "" },
  { key: "invoice_number", description: "" },
  { key: "invoice_date", description: "" },
  { key: "vendor_name", description: "" },
  { key: "total_amount", description: "" },
  { key: "gstin", description: "" },
];

const doc: DocumentRecord = {
  id: "doc_test",
  name: "test.pdf",
  sizeBytes: 10,
  pageCount: null,
  storageKey: "k",
  createdAt: new Date().toISOString(),
};

async function collect(iter: AsyncIterable<ProviderEvent>): Promise<ProviderEvent[]> {
  const out: ProviderEvent[] = [];
  for await (const e of iter) out.push(e);
  return out;
}

describe("MockExtractionProvider", () => {
  it("streams pages then extraction then a terminal event", async () => {
    const p = new MockExtractionProvider({ stepMs: 0, pages: 3 });
    const events = await collect(p.extract(doc, schema, new AbortController().signal));
    const types = events.map((e) => e.type);
    expect(types.filter((t) => t === "page_processed")).toHaveLength(3);
    expect(types).toContain("extraction_started");
    expect(types.filter((t) => t === "partial_result").length).toBeGreaterThan(0);
    // last event is terminal
    const last = types[types.length - 1];
    expect(["completed", "partially_completed"]).toContain(last);
  });

  it("ends partially_completed when low-confidence fields exist", async () => {
    const p = new MockExtractionProvider({ stepMs: 0, pages: 1 });
    const events = await collect(p.extract(doc, schema, new AbortController().signal));
    const terminal = events[events.length - 1];
    // sample fixture includes gstin (0.63) and total_amount (0.74), both < 0.85 and one < 0.7
    expect(terminal?.type).toBe("partially_completed");
    if (terminal?.type === "partially_completed") {
      expect(terminal.failed).toContain("gstin");
    }
  });

  it("stops promptly when aborted", async () => {
    const controller = new AbortController();
    const p = new MockExtractionProvider({ stepMs: 50, pages: 10 });
    const iter = p.extract(doc, schema, controller.signal);
    controller.abort();
    await expect(collect(iter)).rejects.toThrow();
  });
});

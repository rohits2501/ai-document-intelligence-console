import type { DocumentRecord, ExtractedField } from "@/jobs/types";
import { delay, type ExtractionProvider, type ExtractSchema, type ProviderEvent } from "./provider";

/**
 * Deterministic mock provider. Streams page-by-page progress, then partial extraction results
 * with plausible confidence and bounding boxes. No real OCR: the app says so in the UI and README.
 * Used as the default so the demo runs with zero keys.
 */
const SAMPLE_FIELDS: Omit<ExtractedField, "page">[] = [
  {
    key: "document_type",
    value: "Invoice",
    confidence: 0.98,
    bbox: box(0.08, 0.06, 0.3, 0.04),
    source: "p1",
  },
  {
    key: "invoice_number",
    value: "INV-2026-0417",
    confidence: 0.95,
    bbox: box(0.62, 0.08, 0.28, 0.04),
    source: "p1",
  },
  {
    key: "invoice_date",
    value: "2026-09-14",
    confidence: 0.92,
    bbox: box(0.62, 0.14, 0.24, 0.04),
    source: "p1",
  },
  {
    key: "vendor_name",
    value: "Sarvam Logistics Pvt Ltd",
    confidence: 0.89,
    bbox: box(0.08, 0.2, 0.44, 0.05),
    source: "p1",
  },
  {
    key: "total_amount",
    value: "₹1,24,500.00",
    confidence: 0.74,
    bbox: box(0.62, 0.82, 0.28, 0.05),
    source: "p1",
  },
  {
    key: "gstin",
    value: "29ABCDE1234F1Z5",
    confidence: 0.63,
    bbox: box(0.08, 0.86, 0.34, 0.04),
    source: "p1",
  },
];

function box(x: number, y: number, w: number, h: number) {
  return { x, y, w, h };
}

export class MockExtractionProvider implements ExtractionProvider {
  readonly name = "mock";
  private readonly stepMs: number;
  private readonly pages: number;

  constructor(opts: { stepMs?: number; pages?: number } = {}) {
    this.stepMs = opts.stepMs ?? 500;
    this.pages = opts.pages ?? 4;
  }

  async *digitise(_doc: DocumentRecord, signal: AbortSignal): AsyncIterable<ProviderEvent> {
    yield* this.run(signal, null);
  }

  async *extract(
    _doc: DocumentRecord,
    schema: ExtractSchema,
    signal: AbortSignal,
  ): AsyncIterable<ProviderEvent> {
    yield* this.run(signal, schema);
  }

  private async *run(
    signal: AbortSignal,
    schema: ExtractSchema | null,
  ): AsyncIterable<ProviderEvent> {
    for (let page = 1; page <= this.pages; page++) {
      await delay(this.stepMs, signal);
      yield { type: "page_processed", page, totalPages: this.pages };
    }

    await delay(this.stepMs, signal);
    yield { type: "extraction_started" };

    const wanted = schema ? new Set(schema.map((f) => f.key)) : null;
    const fields = SAMPLE_FIELDS.filter((f) => (wanted ? wanted.has(f.key) : true)).map((f) => ({
      ...f,
      page: 1,
    }));

    // stream fields in two partial batches to exercise partial_result handling
    const mid = Math.ceil(fields.length / 2);
    await delay(this.stepMs, signal);
    yield { type: "partial_result", fields: fields.slice(0, mid) };
    await delay(this.stepMs, signal);
    yield { type: "partial_result", fields: fields.slice(mid) };

    await delay(this.stepMs, signal);
    // fields with confidence < 0.7 are treated as needing review; if any, terminal is partial
    const lowConfidence = fields.filter((f) => f.confidence < 0.7).map((f) => f.key);
    if (lowConfidence.length > 0) {
      yield { type: "partially_completed", failed: lowConfidence };
    } else {
      yield { type: "completed" };
    }
  }
}

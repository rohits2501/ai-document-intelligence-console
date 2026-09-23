import type { DocumentRecord, ExtractedField } from "@/jobs/types";

/**
 * Extraction provider interface (spec 0002 AC-7). A `mock` provider is the default; a real
 * `docai` provider is a drop-in. Providers emit ProviderEvents; the worker maps them to
 * JobEvents on the log. Swapping a provider never touches the log, the SSE endpoint, or the UI.
 */
export type ProviderEvent =
  | { type: "page_processed"; page: number; totalPages: number }
  | { type: "extraction_started" }
  | { type: "partial_result"; fields: ExtractedField[] }
  | { type: "completed" }
  | { type: "partially_completed"; failed: string[] }
  | { type: "failed"; error: string };

export interface ExtractSchemaField {
  key: string;
  description: string;
}
export type ExtractSchema = ExtractSchemaField[];

export interface ExtractionProvider {
  readonly name: string;
  digitise(doc: DocumentRecord, signal: AbortSignal): AsyncIterable<ProviderEvent>;
  extract(
    doc: DocumentRecord,
    schema: ExtractSchema,
    signal: AbortSignal,
  ): AsyncIterable<ProviderEvent>;
}

export class ProviderAbortError extends Error {
  constructor() {
    super("provider aborted");
    this.name = "ProviderAbortError";
  }
}

export function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new ProviderAbortError());
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new ProviderAbortError());
      },
      { once: true },
    );
  });
}

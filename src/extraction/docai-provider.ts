import type { DocumentRecord, ExtractedField } from "@/jobs/types";
import { readWhole } from "@/upload/storage";
import {
  delay,
  ProviderAbortError,
  type ExtractionProvider,
  type ExtractSchema,
  type ProviderEvent,
} from "./provider";

/**
 * Real document AI provider (stretch). It speaks the same ProviderEvent language as the mock, so
 * the event log, SSE endpoint, and UI are unchanged when it is selected (spec 0002 AC-7).
 *
 * document AI is a poll-based job API: create a job (digitise/extract), then poll status until a
 * terminal state, then fetch results. This provider bridges that poll model onto our push/event
 * model — exactly the "own the event cursor over a poll API" trade-off the console demonstrates.
 *
 * API :
 *   POST /doc-ai/v1/job/digitise | /extract   (multipart file, header api-subscription-key)
 *   GET  /doc-ai/v1/job/{job_id}/status        -> { status, pages_processed, ... }
 *   GET  /doc-ai/v1/job/{job_id}/results       -> { result, annotations }  (leaves carry confidence+sources)
 *
 * Selected only when EXTRACTION_PROVIDER=docai and DOCAI_API_KEY is set; the mock stays the
 * default so the demo runs with no keys.
 */
const TERMINAL = new Set(["completed", "partially_completed", "failed", "rejected"]);

interface StartJobResponse {
  job_id: string;
  status: string;
  run_id?: string;
}
interface StatusResponse {
  status: string;
  pages_processed?: number;
  pages_succeeded?: number;
  pages_failed?: number;
  pages_total?: number;
}

export class DocAiProvider implements ExtractionProvider {
  readonly name = "docai";
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly pollMs: number;

  constructor() {
    this.baseUrl = process.env.DOCAI_BASE_URL ?? "";
    this.apiKey = process.env.DOCAI_API_KEY ?? "";
    this.pollMs = Number.parseInt(process.env.DOCAI_POLL_MS ?? "1500", 10);
    if (!this.apiKey) {
      throw new Error("DOCAI_API_KEY is required for the docai provider");
    }
    if (!this.baseUrl) {
      throw new Error("DOCAI_BASE_URL is required for the docai provider");
    }
  }

  digitise(doc: DocumentRecord, signal: AbortSignal): AsyncIterable<ProviderEvent> {
    return this.run(doc, null, signal);
  }

  extract(
    doc: DocumentRecord,
    schema: ExtractSchema,
    signal: AbortSignal,
  ): AsyncIterable<ProviderEvent> {
    return this.run(doc, schema, signal);
  }

  private async *run(
    doc: DocumentRecord,
    schema: ExtractSchema | null,
    signal: AbortSignal,
  ): AsyncIterable<ProviderEvent> {
    const kind = schema ? "extract" : "digitise";
    const started = await this.startJob(doc, schema, signal);
    const jobId = started.job_id;

    let lastPages = -1;
    for (;;) {
      if (signal.aborted) throw new ProviderAbortError();
      const status = await this.getStatus(jobId, signal);

      const processed = status.pages_processed ?? 0;
      const total = status.pages_total ?? Math.max(processed, 1);
      if (processed !== lastPages && processed > 0) {
        lastPages = processed;
        yield { type: "page_processed", page: processed, totalPages: total };
      }

      if (TERMINAL.has(status.status)) {
        if (status.status === "failed" || status.status === "rejected") {
          yield { type: "failed", error: `docai job ${status.status}` };
          return;
        }
        // completed or partially_completed: fetch and map results
        yield { type: "extraction_started" };
        const fields = await this.fetchFields(jobId, kind, signal);
        if (fields.length > 0) yield { type: "partial_result", fields };
        if (status.status === "partially_completed") {
          const failed = fields.filter((f) => f.confidence < 0.7).map((f) => f.key);
          yield { type: "partially_completed", failed };
        } else {
          yield { type: "completed" };
        }
        return;
      }

      await delay(this.pollMs, signal);
    }
  }

  private async startJob(
    doc: DocumentRecord,
    schema: ExtractSchema | null,
    signal: AbortSignal,
  ): Promise<StartJobResponse> {
    const bytes = await readWhole(doc.storageKey);
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(bytes)]), doc.name);
    form.append("output_format", "json");
    if (schema) form.append("schema", JSON.stringify(toDocAiSchema(schema)));

    const path = schema ? "/doc-ai/v1/job/extract" : "/doc-ai/v1/job/digitise";
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "api-subscription-key": this.apiKey },
      body: form,
      signal,
    });
    if (!res.ok) throw new Error(`docai ${path} failed (${res.status})`);
    return (await res.json()) as StartJobResponse;
  }

  private async getStatus(jobId: string, signal: AbortSignal): Promise<StatusResponse> {
    const res = await fetch(`${this.baseUrl}/doc-ai/v1/job/${jobId}/status`, {
      headers: { "api-subscription-key": this.apiKey },
      signal,
    });
    if (!res.ok) throw new Error(`docai status failed (${res.status})`);
    return (await res.json()) as StatusResponse;
  }

  private async fetchFields(
    jobId: string,
    _kind: string,
    signal: AbortSignal,
  ): Promise<ExtractedField[]> {
    const res = await fetch(`${this.baseUrl}/doc-ai/v1/job/${jobId}/results`, {
      headers: { "api-subscription-key": this.apiKey },
      signal,
    });
    if (!res.ok) throw new Error(`docai results failed (${res.status})`);
    const body = (await res.json()) as { result?: unknown; annotations?: unknown };
    return mapAnnotations(body.result, body.annotations);
  }
}

/** Build an extract schema (root object with typed, described properties) from our schema. */
function toDocAiSchema(schema: ExtractSchema) {
  const properties: Record<string, { type: string; description: string }> = {};
  for (const f of schema) {
    properties[f.key] = { type: "string", description: f.description || f.key };
  }
  return { type: "object", properties };
}

interface DocAiSource {
  page?: number;
  bbox?: { x?: number; y?: number; w?: number; h?: number } | number[];
}
interface DocAiAnnotation {
  confidence?: number;
  sources?: DocAiSource[];
}

/**
 * Flatten the { result, annotations } into our ExtractedField[]. Annotations mirror the result
 * shape; each leaf carries `confidence` and `sources`. We read top-level string leaves (the schema
 * we send is a flat object) and pull confidence + the first source's page/bbox.
 */
export function mapAnnotations(result: unknown, annotations: unknown): ExtractedField[] {
  if (!result || typeof result !== "object") return [];
  const resultObj = result as Record<string, unknown>;
  const annObj = (annotations && typeof annotations === "object" ? annotations : {}) as Record<
    string,
    DocAiAnnotation
  >;

  const fields: ExtractedField[] = [];
  for (const [key, rawValue] of Object.entries(resultObj)) {
    if (rawValue === null || typeof rawValue === "object") continue; // only flat leaves
    const ann = annObj[key];
    const source = ann?.sources?.[0];
    fields.push({
      key,
      value: String(rawValue),
      confidence: typeof ann?.confidence === "number" ? ann.confidence : 1,
      page: source?.page ?? null,
      bbox: normalizeBBox(source?.bbox),
      source: source?.page != null ? `p${source.page}` : null,
    });
  }
  return fields;
}

function normalizeBBox(
  bbox: DocAiSource["bbox"],
): { x: number; y: number; w: number; h: number } | null {
  if (!bbox) return null;
  if (Array.isArray(bbox)) {
    // [x0, y0, x1, y1] normalized
    const [x0, y0, x1, y1] = bbox;
    if ([x0, y0, x1, y1].some((n) => typeof n !== "number")) return null;
    return {
      x: x0 as number,
      y: y0 as number,
      w: (x1 as number) - (x0 as number),
      h: (y1 as number) - (y0 as number),
    };
  }
  if (typeof bbox.x === "number" && typeof bbox.y === "number") {
    return { x: bbox.x, y: bbox.y, w: bbox.w ?? 0, h: bbox.h ?? 0 };
  }
  return null;
}

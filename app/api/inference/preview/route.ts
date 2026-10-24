import { NextRequest, NextResponse } from "next/server";
import { runtime as store } from "@/jobs/runtime";
import { withStore } from "@/jobs/store-errors";
import { log, newRequestId, span } from "@/telemetry";
import { selectEngine } from "@/inference/engine";
import { fixtureSubject, liveJobSubject, runInference } from "@/inference/preview";
import {
  InferenceEngineError,
  PreviewBody,
  type InferenceErrorCode,
  type PreviewErrorBody,
} from "@/inference/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_FOR_CODE: Record<InferenceErrorCode, number> = {
  not_configured: 501,
  binary_missing: 501,
  timeout: 502,
  crashed: 502,
  bad_output: 502,
  aborted: 502,
};

function errorJson(status: number, body: PreviewErrorBody) {
  return NextResponse.json(body, { status });
}

/**
 * Inference preview (spec 0008). Reads the job, replays its events, and reads the saved review,
 * then checks the facts. Not part of the SSE stream: it appends no event and writes nothing.
 */
export async function POST(req: NextRequest) {
  const requestId = newRequestId();
  const parsed = PreviewBody.safeParse(await req.json().catch(() => undefined));
  if (!parsed.success) {
    return errorJson(400, { error: "invalid_body", message: "The request body is not valid." });
  }
  const { jobId, scenarioPreset } = parsed.data;

  return withStore(async () => {
    const job = store.jobs.get(jobId);
    if (!job) return errorJson(404, { error: "not_found", message: "Job not found." });
    const ctx = { request_id: requestId, job_id: job.id, document_id: job.documentId };

    try {
      const result = await span("inference.preview", ctx, async () => {
        const subject =
          scenarioPreset === "live_job"
            ? liveJobSubject(job, store.eventLog.since(job.id, 0), store.reviews.get(job.id))
            : fixtureSubject(scenarioPreset);
        for (const d of subject.diagnostics) {
          log.warn("inference.diagnostic", {
            ...ctx,
            scenario: scenarioPreset,
            field_key: d.fieldKey,
            reason: d.reason,
          });
        }
        return runInference(selectEngine(), subject, req.signal);
      });
      return NextResponse.json(result);
    } catch (err) {
      if (err instanceof InferenceEngineError) {
        return errorJson(STATUS_FOR_CODE[err.code], { error: err.code, message: err.message });
      }
      throw err;
    }
  });
}

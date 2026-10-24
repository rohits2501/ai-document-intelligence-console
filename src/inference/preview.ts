import { initialJobState, jobReducer } from "@/jobs/job-state";
import type { ExtractedField, JobEvent } from "@/jobs/types";
import type { ReviewRecord } from "@/jobs/review-store";
import { buildDataTurtle, buildResultTurtle, inputHash } from "./build-graph";
import type { InferenceEngine } from "./engine";
import { FIXTURE_INPUTS, type FixtureName } from "./fixtures";
import { normalizeFacts, type NormalizeOutput } from "./normalize-facts";
import { ONTOLOGY_VERSION } from "./ontology";
import type { CanonicalFact, InferenceResult } from "./types";

/** Server side assembly of an InferenceResult. Reads only; never appends, puts, or updates. */

/** Replay the job's events through the client reducer: later partial results win, retries reset. */
export function liveJobFields(events: readonly JobEvent[]): ExtractedField[] {
  return events.reduce(jobReducer, initialJobState).fields;
}

export interface InferenceSubject {
  jobId: string;
  documentId: string;
  facts: CanonicalFact[];
  approvals: ReadonlyMap<string, boolean>;
  diagnostics: NormalizeOutput["diagnostics"];
}

export function liveJobSubject(
  job: { id: string; documentId: string },
  events: readonly JobEvent[],
  review: ReviewRecord | undefined,
): InferenceSubject {
  const { facts, diagnostics } = normalizeFacts({
    documentId: job.documentId,
    jobId: job.id,
    fields: liveJobFields(events),
    review: review ?? null,
  });
  const approvals = new Map((review?.fields ?? []).map((f) => [f.key, f.approved]));
  return { jobId: job.id, documentId: job.documentId, facts, approvals, diagnostics };
}

/** A synthetic preset uses the fixture fields and ids. The job review is not applied. */
export function fixtureSubject(name: FixtureName): InferenceSubject {
  const input = FIXTURE_INPUTS[name];
  const { facts, diagnostics } = normalizeFacts({ ...input, review: null });
  return {
    jobId: input.jobId,
    documentId: input.documentId,
    facts,
    approvals: new Map(),
    diagnostics,
  };
}

export async function runInference(
  engine: InferenceEngine,
  subject: InferenceSubject,
  signal: AbortSignal,
): Promise<InferenceResult> {
  const dataTurtle = buildDataTurtle(subject.documentId, subject.facts);
  const started = Date.now();
  const output = await engine.infer({
    documentId: subject.documentId,
    jobId: subject.jobId,
    facts: subject.facts,
    approvals: subject.approvals,
    dataTurtle,
    signal,
  });
  const durationMs = Date.now() - started;

  return {
    jobId: subject.jobId,
    documentId: subject.documentId,
    canonicalFacts: subject.facts,
    inferredFacts: output.inferredFacts,
    findings: output.findings,
    turtleGraph: buildResultTurtle(subject.documentId, subject.facts, output.inferredFacts),
    certificate: {
      status: output.findings.some((f) => f.severity === "error") ? "rejected" : "verified",
      engineUsed: engine.id,
      ontologyVersion: ONTOLOGY_VERSION,
      inputHash: inputHash(subject.facts),
      durationMs,
    },
  };
}

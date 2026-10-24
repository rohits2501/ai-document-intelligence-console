import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { JobEvent } from "@/jobs/types";
import { selectEngine } from "./engine";
import { EXPECTED_RESULTS, FIXTURE_INPUTS, type FixtureName } from "./fixtures";
import { inputHash } from "./build-graph";
import { fixtureSubject, liveJobSubject, runInference } from "./preview";
import type { InferenceResult } from "./types";

function withoutDuration(result: InferenceResult): InferenceResult {
  return { ...result, certificate: { ...result.certificate, durationMs: 0 } };
}

function runFixture(name: FixtureName): Promise<InferenceResult> {
  return runInference(selectEngine({}), fixtureSubject(name), new AbortController().signal);
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (name.endsWith(".ts") || name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

describe("runInference fixtures", () => {
  it("matches each committed result except durationMs (AC-9, AC-10, AC-11, AC-14, AC-15, AC-18)", async () => {
    for (const name of Object.keys(FIXTURE_INPUTS) as FixtureName[]) {
      const result = await runInference(
        selectEngine({}),
        fixtureSubject(name),
        new AbortController().signal,
      );
      expect(result.jobId).toBe(`fixture-job-${name}`);
      expect(result.documentId).toBe(FIXTURE_INPUTS[name].documentId);
      expect(withoutDuration(result)).toEqual(EXPECTED_RESULTS[name]);
      expect(result.certificate.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.certificate.engineUsed).toBe("ts-symbolic-engine");
      expect(result.certificate.inputHash).toBe(inputHash(result.canonicalFacts));
    }
  });

  it("repeats the same facts, findings, and hash (AC-15)", async () => {
    const first = await runFixture("baseline_mock");
    const second = await runFixture("baseline_mock");
    expect(second.canonicalFacts).toEqual(first.canonicalFacts);
    expect(second.inferredFacts).toEqual(first.inferredFacts);
    expect(second.findings).toEqual(first.findings);
    expect(second.turtleGraph).toEqual(first.turtleGraph);
    expect(second.certificate.inputHash).toBe(first.certificate.inputHash);
    expect(second.certificate.engineUsed).toBe(first.certificate.engineUsed);
  });

  it("keeps baseline provenance on the job and leaves events and the review unchanged (AC-1, AC-2, AC-3)", () => {
    const fields = FIXTURE_INPUTS.baseline_mock.fields;
    const events: JobEvent[] = [
      {
        id: 1,
        jobId: "job-live",
        type: "partial_result",
        ts: "2026-10-24T00:00:00.000Z",
        data: { fields },
      },
    ];
    const review = {
      jobId: "job-live",
      submittedAt: "2026-10-24T00:00:01.000Z",
      fields: [] as { key: string; value: string; approved: boolean }[],
    };
    const eventsBefore = JSON.stringify(events);
    const reviewBefore = JSON.stringify(review);
    const subject = liveJobSubject({ id: "job-live", documentId: "doc-live" }, events, review);

    expect(JSON.stringify(events)).toBe(eventsBefore);
    expect(JSON.stringify(review)).toBe(reviewBefore);
    expect(subject.facts).toHaveLength(7);
    expect(subject.facts.every((f) => f.provenance.origin === "extracted")).toBe(true);
    expect(subject.facts.every((f) => f.provenance.documentId === "doc-live")).toBe(true);
    expect(subject.facts.every((f) => f.provenance.jobId === "job-live")).toBe(true);
    expect(subject.facts.every((f) => f.provenance.page === 1)).toBe(true);
    expect(subject.facts.every((f) => f.provenance.bbox !== null)).toBe(true);
    expect(subject.facts.every((f) => f.provenance.source !== null)).toBe(true);
    expect(subject.approvals.size).toBe(0);
  });
});

describe("inference imports", () => {
  it("is not imported by the job or extraction modules (AC-2)", () => {
    const root = path.resolve(__dirname, "..");
    const hits = ["jobs", "extraction"].flatMap((area) =>
      sourceFiles(path.join(root, area)).filter((file) =>
        /from ["']@\/inference/.test(readFileSync(file, "utf8")),
      ),
    );
    expect(hits).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { BASELINE_FIELDS, FIXTURE_INPUTS, matchesBaseline } from "./fixtures";

describe("matchesBaseline", () => {
  it("accepts the six baseline values and rejects a changed list (AC-14)", () => {
    expect(matchesBaseline(BASELINE_FIELDS)).toBe(true);
    expect(matchesBaseline(BASELINE_FIELDS.map((f) => ({ key: f.key, value: f.value })))).toBe(
      true,
    );
    expect(matchesBaseline(BASELINE_FIELDS.slice(0, 5))).toBe(false);
    expect(
      matchesBaseline(
        BASELINE_FIELDS.map((f) => (f.key === "gstin" ? { ...f, value: "other" } : f)),
      ),
    ).toBe(false);
  });

  it("gives every fixture its own job id (AC-18)", () => {
    for (const name of Object.keys(FIXTURE_INPUTS) as (keyof typeof FIXTURE_INPUTS)[]) {
      expect(FIXTURE_INPUTS[name].jobId).toBe(`fixture-job-${name}`);
    }
  });
});

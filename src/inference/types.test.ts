import { describe, expect, it } from "vitest";
import { PreviewBody } from "./types";

describe("PreviewBody", () => {
  it("treats a missing scenario as the live job (AC-18)", () => {
    expect(PreviewBody.parse({ jobId: "job-1" })).toEqual({
      jobId: "job-1",
      scenarioPreset: "live_job",
    });
  });

  it("rejects an empty job id and an unknown scenario (AC-1, AC-18)", () => {
    expect(PreviewBody.safeParse({}).success).toBe(false);
    expect(PreviewBody.safeParse({ jobId: "" }).success).toBe(false);
    expect(PreviewBody.safeParse({ jobId: "job-1", scenarioPreset: "bogus" }).success).toBe(false);
  });
});

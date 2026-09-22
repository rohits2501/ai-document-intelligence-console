import { describe, expect, it } from "vitest";
import { getPerf, patchPerf, recordPoll, recordSseApply, resetPerf } from "./store";

describe("perf store", () => {
  it("records polls and SSE applies", () => {
    resetPerf();
    recordPoll();
    recordSseApply(3);
    patchPerf({ pagesMounted: 5, pagesTotal: 200 });
    const snap = getPerf();
    expect(snap.pollCount).toBe(1);
    expect(snap.lastPollAt).toBeTypeOf("number");
    expect(snap.sseApplyCount).toBe(3);
    expect(snap.pagesMounted).toBe(5);
    expect(snap.pagesTotal).toBe(200);
    resetPerf();
  });
});

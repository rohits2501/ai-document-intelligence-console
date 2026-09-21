import { describe, it, expect } from "vitest";
import { initialJobState, jobReducer, type JobViewState } from "./job-state";
import type { JobEvent, JobEventType } from "./types";

let seq = 0;
function ev(type: JobEventType, data: JobEvent["data"] = {}, id?: number): JobEvent {
  return { id: id ?? ++seq, jobId: "j", type, ts: new Date().toISOString(), data };
}

function reduce(events: JobEvent[], from: JobViewState = initialJobState): JobViewState {
  return events.reduce(jobReducer, from);
}

describe("jobReducer", () => {
  it("tracks page progress and totals", () => {
    seq = 0;
    const state = reduce([
      ev("queued"),
      ev("processing"),
      ev("page_processed", { page: 1, totalPages: 4 }),
      ev("page_processed", { page: 2, totalPages: 4 }),
    ]);
    expect(state.status).toBe("processing");
    expect(state.pagesProcessed).toBe(2);
    expect(state.totalPages).toBe(4);
  });

  it("merges partial_result fields by key, later value wins", () => {
    seq = 0;
    const state = reduce([
      ev("partial_result", {
        fields: [
          { key: "total", value: "100", confidence: 0.5, page: 1, bbox: null, source: null },
        ],
      }),
      ev("partial_result", {
        fields: [
          { key: "total", value: "120", confidence: 0.9, page: 1, bbox: null, source: null },
        ],
      }),
    ]);
    expect(state.fields).toHaveLength(1);
    expect(state.fields[0]?.value).toBe("120");
    expect(state.fields[0]?.confidence).toBe(0.9);
  });

  it("is idempotent: replaying an already-applied event id is a no-op", () => {
    seq = 0;
    const e1 = ev("queued", {}, 1);
    const e2 = ev("processing", {}, 2);
    const once = reduce([e1, e2]);
    const replayed = reduce([e1, e2], once); // same ids again
    expect(replayed.events).toHaveLength(2);
    expect(replayed.lastEventId).toBe(2);
  });

  it("ignores out-of-order stale events (id <= lastEventId)", () => {
    seq = 0;
    const state = reduce([ev("queued", {}, 1), ev("completed", {}, 5), ev("processing", {}, 3)]);
    // the stale id=3 after id=5 must not flip status back to processing
    expect(state.status).toBe("completed");
    expect(state.lastEventId).toBe(5);
  });

  it("records partial completion and failed keys", () => {
    seq = 0;
    const state = reduce([ev("partially_completed", { failed: ["gstin", "total_amount"] })]);
    expect(state.status).toBe("partially_completed");
    expect(state.failedKeys).toEqual(["gstin", "total_amount"]);
  });

  it("resets run-derived state on a re-queued event (retry boundary)", () => {
    seq = 0;
    const state = reduce([
      ev("page_processed", { page: 2, totalPages: 4 }),
      ev("partial_result", {
        fields: [{ key: "a", value: "1", confidence: 0.9, page: 1, bbox: null, source: null }],
      }),
      ev("partially_completed", { failed: ["b"] }),
      ev("queued", { message: "retry" }), // retry boundary
    ]);
    expect(state.status).toBe("queued");
    expect(state.pagesProcessed).toBe(0);
    expect(state.totalPages).toBeNull();
    expect(state.fields).toHaveLength(0);
    expect(state.failedKeys).toHaveLength(0);
    expect(state.error).toBeNull();
    // history is preserved even though derived state reset
    expect(state.events.length).toBe(4);
  });

  it("surfaces cancellation as a terminal failure", () => {
    seq = 0;
    const state = reduce([ev("processing"), ev("cancelled")]);
    expect(state.status).toBe("failed");
    expect(state.error).toMatch(/cancelled/i);
  });
});

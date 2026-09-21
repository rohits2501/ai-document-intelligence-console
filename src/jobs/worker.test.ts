import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryEventLog } from "./event-log";
import { InMemoryJobStore } from "./store";
import { runJob, cancelJob } from "./worker";
import { registerProvider } from "@/extraction";
import { MockExtractionProvider } from "@/extraction/mock-provider";
import type { DocumentRecord } from "./types";
import { isTerminal } from "./types";

const doc: DocumentRecord = {
  id: "doc_w",
  name: "w.pdf",
  sizeBytes: 1,
  pageCount: null,
  storageKey: "k",
  createdAt: new Date().toISOString(),
};

describe("job worker", () => {
  beforeEach(() => {
    // fast provider for tests
    registerProvider("mock", () => new MockExtractionProvider({ stepMs: 0, pages: 2 }));
  });

  it("drives a job to a terminal status and appends an ordered event log", async () => {
    const jobs = new InMemoryJobStore();
    const eventLog = new InMemoryEventLog();
    const job = jobs.create(doc.id, "extract");

    await runJob({ jobs, eventLog }, job.id, doc, { kind: "extract" });

    const events = eventLog.since(job.id, 0);
    expect(events.length).toBeGreaterThan(0);
    // ids are contiguous and 1-based
    expect(events.map((e) => e.id)).toEqual(events.map((_, i) => i + 1));
    const finalStatus = jobs.get(job.id)?.status;
    expect(finalStatus && isTerminal(finalStatus)).toBe(true);
    // job.lastEventId tracks the last appended event
    expect(jobs.get(job.id)?.lastEventId).toBe(events[events.length - 1]?.id);
  });

  it("appends a cancelled event and stops when cancelled mid-run", async () => {
    registerProvider("mock", () => new MockExtractionProvider({ stepMs: 25, pages: 20 }));
    const jobs = new InMemoryJobStore();
    const eventLog = new InMemoryEventLog();
    const job = jobs.create(doc.id, "extract");

    const done = runJob({ jobs, eventLog }, job.id, doc, { kind: "extract" });
    await new Promise((r) => setTimeout(r, 40)); // let it start processing
    expect(cancelJob(job.id)).toBe(true);
    await done;

    const types = eventLog.since(job.id, 0).map((e) => e.type);
    expect(types).toContain("cancelled");
    // no terminal completion after a cancel
    expect(types).not.toContain("completed");
  });
});

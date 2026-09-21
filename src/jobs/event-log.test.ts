import { describe, it, expect } from "vitest";
import { InMemoryEventLog } from "./event-log";

describe("InMemoryEventLog", () => {
  it("assigns monotonic 1-based ids per job", () => {
    const log = new InMemoryEventLog();
    const a = log.append("job1", "queued", {});
    const b = log.append("job1", "processing", {});
    expect(a.id).toBe(1);
    expect(b.id).toBe(2);
    expect(log.latestId("job1")).toBe(2);
  });

  it("keeps ids independent per job", () => {
    const log = new InMemoryEventLog();
    log.append("job1", "queued", {});
    const other = log.append("job2", "queued", {});
    expect(other.id).toBe(1);
  });

  it("since(0) returns the full ordered log", () => {
    const log = new InMemoryEventLog();
    log.append("j", "queued", {});
    log.append("j", "processing", {});
    log.append("j", "completed", {});
    const all = log.since("j", 0);
    expect(all.map((e) => e.id)).toEqual([1, 2, 3]);
  });

  it("since(n) replays only events after n, gap-free", () => {
    const log = new InMemoryEventLog();
    for (let i = 0; i < 5; i++) log.append("j", "page_processed", { page: i + 1 });
    const after = log.since("j", 3);
    expect(after.map((e) => e.id)).toEqual([4, 5]);
  });

  it("notifies live subscribers and stops after unsubscribe", () => {
    const log = new InMemoryEventLog();
    const seen: number[] = [];
    const unsub = log.subscribe("j", (e) => seen.push(e.id));
    log.append("j", "queued", {});
    log.append("j", "processing", {});
    unsub();
    log.append("j", "completed", {});
    expect(seen).toEqual([1, 2]);
  });

  it("stamps attempt 1 on the first queued event and increments on retry (AC-9)", () => {
    const log = new InMemoryEventLog();
    const first = log.append("j", "queued", { message: "first" });
    log.append("j", "failed", { error: "boom" });
    const retry = log.append("j", "queued", { message: "retry" });
    expect(first.data.attempt).toBe(1);
    expect(retry.data.attempt).toBe(2);
  });
});

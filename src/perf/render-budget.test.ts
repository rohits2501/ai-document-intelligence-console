import { describe, expect, it } from "vitest";
import { vitalBreach } from "./field-budgets";
import { renderBreaches } from "./render-budget";
import { getPerf, resetPerf } from "./store";

describe("render budget", () => {
  it("stays quiet until a surface has something to measure", () => {
    resetPerf();
    expect(renderBreaches(getPerf())).toEqual([]);
  });

  it("passes the enhanced fixture shape and fails a mount-everything shape", () => {
    const enhanced = renderBreaches({
      ...getPerf(),
      pagesMounted: 3,
      pagesTotal: 200,
      reviewMounted: 14,
      reviewTotal: 500,
      eventsMounted: 25,
      eventsTotal: 2000,
      jobsMounted: 13,
      jobsTotal: 102,
      heapUsed: 50 * 1024 * 1024,
    });
    expect(enhanced).toEqual([]);

    const naive = renderBreaches({
      ...getPerf(),
      pagesMounted: 200,
      pagesTotal: 200,
      reviewMounted: 500,
      reviewTotal: 500,
      eventsMounted: 2000,
      eventsTotal: 2000,
      jobsMounted: 102,
      jobsTotal: 102,
      heapUsed: 90 * 1024 * 1024,
    });
    expect(naive.map((breach) => breach.metric)).toEqual([
      "pages",
      "review",
      "events",
      "jobs",
      "heap",
    ]);
  });
});

describe("web vitals budget", () => {
  it("logs only the vitals we hold, and only when they cross the good threshold", () => {
    expect(vitalBreach("LCP", 2500)).toBeNull();
    expect(vitalBreach("LCP", 2501)).toEqual({ name: "LCP", value: 2501, max: 2500 });
    expect(vitalBreach("CLS", 0.11)?.max).toBe(0.1);
    expect(vitalBreach("Next.js-hydration", 50)).toBeNull();
  });
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("bench ceilings match the rendering ceilings", () => {
  const budgets = readFileSync("src/perf/field-budgets.ts", "utf8");
  const bench = readFileSync("scripts/run-bench.mjs", "utf8");
  const pairs = [
    ["pagesMountedMax: 12", "pages: 12"],
    ["reviewMountedMax: 40", "review: 40"],
    ["eventsMountedMax: 80", "events: 80"],
    ["jobsMountedMax: 32", "jobs: 32"],
    ["heapBytesMax: 80 * 1024 * 1024", "heap: 80 * 1024 * 1024"],
  ];
  for (const [source, copy] of pairs) {
    assert.ok(budgets.includes(source), source);
    assert.ok(bench.includes(copy), copy);
  }
});

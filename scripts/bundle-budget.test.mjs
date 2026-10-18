import assert from "node:assert/strict";
import test from "node:test";
import { evaluateLimits, initialCeiling, normalizeAppPath } from "./check-bundle-budget.mjs";

test("normalizeAppPath matches Next route keys", () => {
  assert.equal(normalizeAppPath("/page"), "/");
  assert.equal(normalizeAppPath("/jobs/[id]/page"), "/jobs/[id]");
  assert.equal(normalizeAppPath("/(marketing)/about/page"), "/about");
  assert.equal(normalizeAppPath("/review/[episodeId]/page"), "/review/[episodeId]");
  assert.equal(normalizeAppPath("/api/jobs/route"), "/api/jobs");
});

test("initial ceiling is the measurement rounded up to 1 KiB plus 8 KiB", () => {
  assert.equal(initialCeiling(1000), 1024 + 8192);
  assert.equal(initialCeiling(1024), 1024 + 8192);
  assert.equal(initialCeiling(1025), 2048 + 8192);
});

test("evaluateLimits fails when a route is over, missing, or new", () => {
  const limits = [{ path: "/", maxBytes: 100 }];

  const over = evaluateLimits([{ path: "/", bytes: 101 }], limits);
  assert.deepEqual(over, [{ path: "/", reason: "over", bytes: 101, maxBytes: 100 }]);

  const onBudget = evaluateLimits([{ path: "/", bytes: 100 }], limits);
  assert.deepEqual(onBudget, []);

  const missing = evaluateLimits([], limits);
  assert.equal(missing[0].reason, "missing");

  const extra = evaluateLimits(
    [
      { path: "/", bytes: 50 },
      { path: "/new", bytes: 10 },
    ],
    limits,
  );
  assert.ok(extra.some((failure) => failure.reason === "unbudgeted" && failure.path === "/new"));
});

test("asset checks do not require every file on disk to be listed", () => {
  const failures = evaluateLimits(
    [{ path: "public/pdf.worker.min.mjs", bytes: 10 }],
    [{ path: "public/pdf.worker.min.mjs", maxBytes: 20 }],
    { allowUnbudgeted: true },
  );
  assert.deepEqual(failures, []);
});

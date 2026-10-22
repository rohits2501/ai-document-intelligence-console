import assert from "node:assert/strict";
import test from "node:test";
import { renderComment } from "./perf-comment.mjs";

const headBundles = {
  bundles: [
    { name: "catalog JS", parsed: 240120, gzip: 71020 },
    { name: "theme.css", parsed: 1100, gzip: 505 },
    { name: "presets.css", parsed: 3000, gzip: 900 },
  ],
  benches: [],
};

const baseBundles = {
  bundles: [
    { name: "catalog JS", parsed: 240000, gzip: 71000 },
    { name: "theme.css", parsed: 1000, gzip: 500 },
    { name: "presets.css", parsed: 3200, gzip: 1000 },
  ],
  benches: [],
};

test("marks a bundle growth of at least 100 B or 1% and leaves a shrink unmarked", () => {
  const markdown = renderComment({ head: headBundles, base: baseBundles });
  assert.match(
    markdown,
    /\| catalog JS \| 240120 B 🔺\+120 B \(\+0\.1%\) \| 71020 B \+20 B \(\+0\.0%\) \|/,
  );
  assert.match(
    markdown,
    /\| theme\.css \| 1100 B 🔺\+100 B \(\+10\.0%\) \| 505 B 🔺\+5 B \(\+1\.0%\) \|/,
  );
  assert.match(
    markdown,
    /\| presets\.css \| 3000 B -200 B \(-6\.3%\) \| 900 B -100 B \(-10\.0%\) \|/,
  );
  assert.doesNotMatch(markdown, /presets\.css \| 3000 B 🔺/);
});

test("collapses a bench inside the noise band and does not alarm on paint", () => {
  const markdown = renderComment({
    head: {
      bundles: [],
      benches: [{ name: "Catalog mount", durationMs: 42, count: 5, paintMs: 30 }],
    },
    base: {
      bundles: [],
      benches: [{ name: "Catalog mount", durationMs: 40, count: 5, paintMs: 12 }],
    },
  });
  assert.match(markdown, /1 test within noise/);
  assert.doesNotMatch(markdown, /\| Catalog mount \|/);
  assert.match(markdown, /## Metric alarms\n\nNone\./);
});

test("alarms when duration regresses by at least 20%", () => {
  const markdown = renderComment({
    head: {
      bundles: [],
      benches: [{ name: "Catalog mount", durationMs: 52, count: 5, paintMs: 12 }],
    },
    base: {
      bundles: [],
      benches: [{ name: "Catalog mount", durationMs: 40, count: 5, paintMs: 12 }],
    },
  });
  assert.match(markdown, /\| Catalog mount \|/);
  assert.match(markdown, /\| Catalog mount \| duration \| 🔺 \+12\.00 ms \|/);
  assert.doesNotMatch(markdown, /within noise/);
});

test("alarms when a count crosses its ceiling, including with no baseline", () => {
  const markdown = renderComment({
    head: {
      bundles: [],
      benches: [
        {
          name: "Job console",
          durationMs: 100,
          count: 20,
          paintMs: 10,
          timing: "noise",
          counts: [{ metric: "pages", value: 20, max: 12 }],
        },
      ],
    },
    base: null,
  });
  assert.match(markdown, /Baseline arrives on the next main build\./);
  assert.match(markdown, /\| Job console \| pages \| 🔺 20 over 12 \|/);
});

test("a noisy timing stays collapsed when the counts do not change", () => {
  const markdown = renderComment({
    head: {
      bundles: [],
      benches: [
        {
          name: "Home list",
          durationMs: 800,
          count: 13,
          paintMs: 400,
          timing: "noise",
          counts: [{ metric: "jobs", value: 13, max: 32 }],
        },
      ],
    },
    base: {
      bundles: [],
      benches: [
        {
          name: "Home list",
          durationMs: 200,
          count: 13,
          paintMs: 50,
          timing: "noise",
          counts: [{ metric: "jobs", value: 13, max: 32 }],
        },
      ],
    },
  });
  assert.match(markdown, /1 test within noise/);
  assert.match(markdown, /## Metric alarms\n\nNone\./);
  assert.doesNotMatch(markdown, /\| Home list \| 800/);
});

test("prints absolute sizes when the baseline has not been stored", () => {
  const markdown = renderComment({
    head: { bundles: [{ name: "catalog JS", parsed: 240000, gzip: 71000 }], benches: [] },
    base: null,
  });
  assert.match(markdown, /Baseline arrives on the next main build\./);
  assert.match(markdown, /\| catalog JS \| 240000 B \| 71000 B \|/);
  assert.doesNotMatch(markdown, /🔺/);
  assert.doesNotMatch(markdown, /## Performance/);
});

#!/usr/bin/env node
/**
 * Seed the perf fixture and count mounted rows in Chromium.
 * [data-perf] is on the production markup, so this uses the build CI already gated.
 * Rebuilding with NEXT_PUBLIC_PERF_HUD would change that bundle. EXTRACTION_PROVIDER
 * stays mock. Duration and paint use timing "noise": a different runner must not alarm.
 * Ceilings match src/perf/field-budgets.ts.
 *
 *   node scripts/run-bench.mjs
 */
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";

const ceilings = {
  pages: 12,
  review: 40,
  events: 80,
  jobs: 32,
  heap: 80 * 1024 * 1024,
};

const dataDir = mkdtempSync(path.join(tmpdir(), "perf-fixture-"));
const port = 3456;
execFileSync("npx", ["tsx", "scripts/seed-perf-fixture.ts"], {
  env: { ...process.env, DATA_DIR: dataDir },
  stdio: "inherit",
});

const server = spawn("npx", ["next", "start", "-p", String(port)], {
  env: { ...process.env, DATA_DIR: dataDir, EXTRACTION_PROVIDER: "mock" },
  stdio: "inherit",
});

async function waitForServer(url) {
  const start = Date.now();
  while (Date.now() - start < 60_000) {
    try {
      const response = await fetch(url);
      if (response.status < 500) return;
    } catch {
      // the server is still booting
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Server did not start at ${url}`);
}

async function paintMs(page) {
  return page.evaluate(`(() => {
    const paint = performance.getEntriesByType("paint").find((entry) => entry.name === "first-contentful-paint");
    return paint ? paint.startTime : 0;
  })()`);
}

async function heapBytes(page) {
  const client = await page.context().newCDPSession(page);
  const usage = await client.send("Runtime.getHeapUsage");
  return usage.usedSize;
}

function writeBenches(benches) {
  const snapshotPath = path.resolve("perf/snapshot.json");
  const current = existsSync(snapshotPath)
    ? JSON.parse(readFileSync(snapshotPath, "utf8"))
    : { bundles: [] };
  current.benches = benches;
  writeFileSync(snapshotPath, `${JSON.stringify(current, null, 2)}\n`);
}

const browser = await chromium.launch();
try {
  await waitForServer(`http://127.0.0.1:${port}/`);
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  let started = Date.now();
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
  await page.locator('[data-perf="job-row"]').first().waitFor({ timeout: 30_000 });
  const home = {
    name: "Home list",
    durationMs: Date.now() - started,
    count: await page.locator('[data-perf="job-row"]').count(),
    paintMs: await paintMs(page),
    timing: "noise",
    counts: [{ metric: "jobs", value: 0, max: ceilings.jobs }],
  };
  home.counts[0].value = home.count;

  started = Date.now();
  await page.goto(`http://127.0.0.1:${port}/jobs/job_perf-bench`, {
    waitUntil: "domcontentloaded",
  });
  // The last page_processed event is not page 200, so the progress line is not a finished signal.
  // Review fields (500) means the replay, including the terminal event, has been applied.
  try {
    await page.getByText("Review fields (500)").waitFor({ timeout: 60_000 });
    await page.locator('[data-perf="page"]').first().waitFor({ timeout: 30_000 });
  } catch (error) {
    const text = await page
      .locator("body")
      .innerText()
      .catch(() => "");
    console.error(text.slice(0, 1500));
    throw error;
  }
  const pages = await page.locator('[data-perf="page"]').count();
  const review = await page.locator('[data-perf="review-row"]').count();
  const events = await page.locator('[data-perf="event-row"]').count();
  const heap = await heapBytes(page);
  const job = {
    name: "Job console",
    durationMs: Date.now() - started,
    count: pages,
    paintMs: await paintMs(page),
    timing: "noise",
    counts: [
      { metric: "pages", value: pages, max: ceilings.pages },
      { metric: "review", value: review, max: ceilings.review },
      { metric: "events", value: events, max: ceilings.events },
      { metric: "heap", value: heap, max: ceilings.heap, alarm: "ceiling" },
    ],
  };

  writeBenches([home, job]);
  console.log(`Home list jobs ${home.count}`);
  console.log(`Job console pages ${pages} review ${review} events ${events} heap ${heap}`);
} finally {
  await browser.close();
  server.kill("SIGTERM");
  rmSync(dataDir, { recursive: true, force: true });
}

#!/usr/bin/env node
/**
 * Compare two perf snapshots and print the sticky pull-request comment.
 * This file is the same in design-system, ai-document-intelligence-console, audioforge, and bol.
 *
 *   node scripts/perf-comment.mjs --head perf/snapshot.json --base perf-base/snapshot.json --run-url URL --post
 *   node scripts/perf-comment.mjs --head perf/snapshot.json --fresh-benches perf-base/benches.json --post
 *
 * --fresh-benches replaces the base benches. Pass it when paint must be compared inside one job.
 * Leave it off when the base snapshot's benches are the diff.
 * A bench with timing "noise" stays collapsed unless its counts change. Its duration and paint
 * never raise an alarm.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const MARKER = "<!-- perf-budget -->";

const MARK = "🔺";
const BYTE_MARK = 100;
const BYTE_RATIO = 0.01;
const NOISE_MS = 5;
const NOISE_RATIO = 0.1;
const ALARM_RATIO = 0.2;

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function signed(value, suffix) {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "+";
  return `${sign}${suffix}`;
}

function percent(delta, base) {
  if (!base) return null;
  const value = (delta / base) * 100;
  const body = `${Math.abs(value).toFixed(1)}%`;
  return signed(value, body);
}

function bytesCell(current, previous) {
  if (previous == null) return `${current} B`;
  const delta = current - previous;
  const ratio = previous > 0 ? delta / previous : null;
  const pct = percent(delta, previous);
  const body = pct
    ? `${signed(delta, `${Math.abs(delta)} B`)} (${pct})`
    : signed(delta, `${Math.abs(delta)} B`);
  const marked = delta > 0 && (delta >= BYTE_MARK || (ratio != null && ratio >= BYTE_RATIO));
  return `${current} B ${marked ? MARK : ""}${body}`;
}

function ms(value) {
  return `${value.toFixed(2)} ms`;
}

function msDelta(current, previous) {
  if (previous == null) return ms(current);
  const delta = current - previous;
  const pct = percent(delta, previous);
  const body = pct
    ? `${signed(delta, ms(Math.abs(delta)))} (${pct})`
    : signed(delta, ms(Math.abs(delta)));
  return `${ms(current)} ${body}`;
}

function countItems(bench) {
  if (bench.counts && bench.counts.length > 0) return bench.counts;
  return [{ metric: "renders", value: bench.count, max: bench.countMax }];
}

function sameCounts(head, base) {
  if (head.count !== base.count) return false;
  const baseItems = new Map((base.counts ?? []).map((item) => [item.metric, item.value]));
  const headItems = head.counts ?? [];
  if (headItems.length !== (base.counts ?? []).length) return false;
  return headItems.every((item) => baseItems.get(item.metric) === item.value);
}

function withinNoise(head, base) {
  if (!base || !sameCounts(head, base)) return false;
  if (head.timing === "noise") return true;
  const delta = Math.abs(head.durationMs - base.durationMs);
  const ratio = base.durationMs === 0 ? (delta === 0 ? 0 : Infinity) : delta / base.durationMs;
  return delta < NOISE_MS && ratio < NOISE_RATIO;
}

function benchAlarms(head, base) {
  const alarms = [];
  if (base && head.timing !== "noise") {
    const delta = head.durationMs - base.durationMs;
    const ratio = base.durationMs === 0 ? (delta > 0 ? Infinity : 0) : delta / base.durationMs;
    if (delta > 0 && ratio >= ALARM_RATIO) {
      alarms.push({
        test: head.name,
        metric: "duration",
        change: `${MARK} +${delta.toFixed(2)} ms`,
      });
    }
  }
  const items = countItems(head);
  const baseByMetric = new Map(
    countItems(base ?? { count: base?.count }).map((item) => [item.metric, item.value]),
  );
  if (!base) baseByMetric.clear();
  for (const item of items) {
    const previous = base ? baseByMetric.get(item.metric) : undefined;
    const ceilingOnly = item.alarm === "ceiling";
    if (!ceilingOnly && previous != null && previous > 0) {
      const delta = item.value - previous;
      if (delta > 0 && delta / previous >= ALARM_RATIO) {
        alarms.push({ test: head.name, metric: item.metric, change: `${MARK} +${delta}` });
      }
    }
    if (item.max != null && item.value > item.max) {
      alarms.push({
        test: head.name,
        metric: item.metric,
        change: `${MARK} ${item.value} over ${item.max}`,
      });
    }
  }
  return alarms;
}

function durationAlarm(head, base) {
  return benchAlarms(head, base).some((alarm) => alarm.metric === "duration");
}

function renderAlarm(head, base) {
  return benchAlarms(head, base).some(
    (alarm) => alarm.metric === "renders" || alarm.metric === "count",
  );
}

function sum(benches, key) {
  return benches.reduce((total, bench) => total + bench[key], 0);
}

function fileRows(head, base) {
  const baseBundles = new Map((base?.bundles ?? []).map((bundle) => [bundle.name, bundle]));
  const rows = [];
  for (const bundle of head.bundles ?? []) {
    const previous = new Map(
      (baseBundles.get(bundle.name)?.files ?? []).map((file) => [file.path, file]),
    );
    for (const file of bundle.files ?? []) {
      const before = previous.get(file.path);
      rows.push({
        bundle: bundle.name,
        path: file.path,
        parsed: bytesCell(file.parsed, before?.parsed),
        gzip: bytesCell(file.gzip, before?.gzip),
      });
    }
  }
  return rows;
}

function countDetails(benches) {
  const rows = [];
  for (const bench of benches) {
    for (const item of bench.counts ?? []) {
      rows.push({
        test: bench.name,
        metric: item.metric,
        value: item.value,
        max: item.max,
      });
    }
  }
  return rows;
}

/**
 * @param {{ head: { bundles?: object[], benches?: object[] }, base?: { bundles?: object[], benches?: object[] } | null, runUrl?: string }} input
 */
export function renderComment({ head, base, runUrl }) {
  const bundles = head.bundles ?? [];
  const benches = head.benches ?? [];
  const baseBundles = new Map((base?.bundles ?? []).map((bundle) => [bundle.name, bundle]));
  const baseBenches = new Map((base?.benches ?? []).map((bench) => [bench.name, bench]));
  const hasBase =
    base != null && ((base.bundles ?? []).length > 0 || (base.benches ?? []).length > 0);
  const lines = [MARKER, ""];

  if (!hasBase) {
    lines.push("Baseline arrives on the next main build.", "");
  }

  lines.push("## Bundle size", "");
  lines.push("| Bundle | Parsed size | Gzip size |");
  lines.push("| --- | --- | --- |");
  for (const bundle of bundles) {
    const previous = baseBundles.get(bundle.name);
    lines.push(
      `| ${bundle.name} | ${bytesCell(bundle.parsed, previous?.parsed)} | ${bytesCell(bundle.gzip, previous?.gzip)} |`,
    );
  }
  lines.push("");

  const files = fileRows(head, base);
  if (files.length > 0) {
    lines.push("<details>");
    lines.push("<summary>Details of bundle changes</summary>", "");
    lines.push("| Bundle | File | Parsed | Gzip |");
    lines.push("| --- | --- | --- | --- |");
    for (const file of files) {
      lines.push(`| ${file.bundle} | ${file.path} | ${file.parsed} | ${file.gzip} |`);
    }
    lines.push("", "</details>", "");
  }

  if (benches.length > 0) {
    const baseList = benches.map((bench) => baseBenches.get(bench.name)).filter(Boolean);
    const comparable = baseList.length === benches.length;
    lines.push("## Performance", "");
    const duration = sum(benches, "durationMs");
    const renders = sum(benches, "count");
    const paint = sum(benches, "paintMs");
    const baseDuration = comparable ? sum(baseList, "durationMs") : null;
    const baseRenders = comparable ? sum(baseList, "count") : null;
    const basePaint = comparable ? sum(baseList, "paintMs") : null;
    const renderDelta =
      baseRenders == null
        ? `${renders}`
        : `${renders} (${signed(renders - baseRenders, String(Math.abs(renders - baseRenders)))})`;
    lines.push(
      `Total duration: ${msDelta(duration, baseDuration)} | Renders: ${renderDelta} | Paint: ${msDelta(paint, basePaint)}`,
      "",
    );

    const visible = [];
    let hidden = 0;
    for (const bench of benches) {
      const previous = baseBenches.get(bench.name);
      if (previous && withinNoise(bench, previous)) hidden += 1;
      else visible.push(bench);
    }
    if (visible.length > 0) {
      lines.push("| Test | Duration | Renders | Paint |");
      lines.push("| --- | --- | --- | --- |");
      for (const bench of visible) {
        const previous = baseBenches.get(bench.name);
        const durationCell = msDelta(bench.durationMs, previous?.durationMs);
        const markedDuration =
          previous && durationAlarm(bench, previous)
            ? durationCell.replace(" ms ", ` ms ${MARK}`)
            : durationCell;
        const countDelta =
          previous == null
            ? String(bench.count)
            : `${bench.count} (${signed(bench.count - previous.count, String(Math.abs(bench.count - previous.count)))})`;
        const markedCount =
          previous && renderAlarm(bench, previous) ? `${MARK}${countDelta}` : countDelta;
        lines.push(
          `| ${bench.name} | ${markedDuration} | ${markedCount} | ${msDelta(bench.paintMs, previous?.paintMs)} |`,
        );
      }
      lines.push("");
    }
    if (hidden > 0) {
      lines.push(`${hidden} test${hidden === 1 ? "" : "s"} within noise`, "");
    }

    const mounts = countDetails(benches);
    if (mounts.length > 0) {
      lines.push("<details>");
      lines.push("<summary>Mount counts</summary>", "");
      lines.push("| Test | Metric | Count | Ceiling |");
      lines.push("| --- | --- | ---: | ---: |");
      for (const mount of mounts) {
        lines.push(`| ${mount.test} | ${mount.metric} | ${mount.value} | ${mount.max ?? ""} |`);
      }
      lines.push("", "</details>", "");
    }

    const alarms = benches.flatMap((bench) => benchAlarms(bench, baseBenches.get(bench.name)));
    lines.push("## Metric alarms", "");
    if (alarms.length === 0) {
      lines.push("None.", "");
    } else {
      lines.push("| Test | Metric | Change |");
      lines.push("| --- | --- | --- |");
      for (const alarm of alarms) {
        lines.push(`| ${alarm.test} | ${alarm.metric} | ${alarm.change} |`);
      }
      lines.push("");
    }
  }

  if (runUrl) {
    lines.push(`[Details of this run](${runUrl})`, "");
  }
  return `${lines.join("\n").trim()}\n`;
}

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "perf-budget",
  };
}

export async function upsertComment({ body, repo, pr, token, fetchImpl = fetch }) {
  let existing = null;
  for (let page = 1; page <= 5; page += 1) {
    const listed = await fetchImpl(
      `https://api.github.com/repos/${repo}/issues/${pr}/comments?per_page=100&page=${page}`,
      { headers: headers(token) },
    );
    if (!listed.ok) throw new Error(`Listing comments failed (${listed.status}).`);
    const comments = await listed.json();
    existing = comments.find((comment) => String(comment.body ?? "").includes(MARKER)) ?? null;
    if (existing || comments.length < 100) break;
  }
  if (existing) {
    const updated = await fetchImpl(
      `https://api.github.com/repos/${repo}/issues/comments/${existing.id}`,
      {
        method: "PATCH",
        headers: { ...headers(token), "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      },
    );
    if (!updated.ok) throw new Error(`Updating the comment failed (${updated.status}).`);
    return;
  }
  const created = await fetchImpl(`https://api.github.com/repos/${repo}/issues/${pr}/comments`, {
    method: "POST",
    headers: { ...headers(token), "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
  if (!created.ok) throw new Error(`Posting the comment failed (${created.status}).`);
}

function arg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function loadOptional(file) {
  if (!file || !existsSync(file)) return null;
  return readJson(file);
}

async function main() {
  const headPath = arg("--head");
  if (!headPath || !existsSync(headPath)) {
    console.error("Missing --head snapshot.");
    process.exitCode = 1;
    return;
  }
  const head = readJson(headPath);
  const base = loadOptional(arg("--base"));
  const freshPath = arg("--fresh-benches");
  const fresh = freshPath ? (loadOptional(freshPath) ?? { benches: [] }) : null;
  const resolvedBase = fresh
    ? { bundles: base?.bundles ?? [], benches: fresh.benches ?? [] }
    : base;
  const hasResolvedBase =
    resolvedBase != null &&
    ((resolvedBase.bundles ?? []).length > 0 || (resolvedBase.benches ?? []).length > 0);
  const markdown = renderComment({
    head,
    base: hasResolvedBase ? resolvedBase : null,
    runUrl: arg("--run-url") ?? undefined,
  });
  const out = arg("--out");
  if (out) writeFileSync(out, markdown);
  else process.stdout.write(markdown);

  if (!process.argv.includes("--post")) return;
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  const pr = process.env.PR_NUMBER;
  if (!token || !repo || !pr) {
    console.error("Skipping the comment. GH_TOKEN, GITHUB_REPOSITORY, and PR_NUMBER are required.");
    return;
  }
  await upsertComment({ body: markdown, repo, pr, token });
}

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === entry) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

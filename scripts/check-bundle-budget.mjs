/**
 * Gate gzipped first-load JS against perf/budgets.json.
 *
 * The byte count matches the "First Load JS" column of `next build`: level-9 gzip of the
 * client JS files Next lists for that route (page chunks plus the shared `_app` chunks).
 * A route with no budget fails, and so does a budget whose route disappeared.
 * Optional `assets` are repo files (for example a pdf.js worker). Optional `markers` match
 * deferred chunks by a stable source string, so a lazy library is budgeted without pinning its hash.
 *
 * Run after a production build: `node scripts/check-bundle-budget.mjs`
 * Print the measurement without enforcing: `node scripts/check-bundle-budget.mjs --print`
 */
import { createRequire } from "node:module";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const gzipSize = require("next/dist/compiled/gzip-size");

const KIB = 1024;
const SLACK_BYTES = 8 * KIB;

/** Initial ceiling: round the measurement up to the next KiB, then add 8 KiB. */
export function initialCeiling(bytes) {
  return Math.ceil(bytes / KIB) * KIB + SLACK_BYTES;
}

/** Same normalization Next uses for app-build-manifest keys (`/page` → `/`). */
export function normalizeAppPath(route) {
  const pathname = route.split("/").reduce((acc, segment, index, segments) => {
    if (!segment) return acc;
    if (segment.startsWith("(") && segment.endsWith(")")) return acc;
    if (segment.startsWith("@")) return acc;
    if ((segment === "page" || segment === "route") && index === segments.length - 1) {
      return acc;
    }
    return `${acc}/${segment}`;
  }, "");
  return pathname === "" ? "/" : pathname;
}

function isPageEntry(key) {
  // Route handlers are not a document the browser loads. Budget app pages only.
  return key.endsWith("/page") || key === "/_not-found";
}

/**
 * @param {{ path: string, bytes: number }[]} measured
 * @param {{ path: string, maxBytes: number }[]} limits
 * @param {{ allowUnbudgeted?: boolean }} [opts]
 */
export function evaluateLimits(measured, limits, opts = {}) {
  const failures = [];
  const byPath = new Map(measured.map((row) => [row.path, row.bytes]));
  const budgeted = new Set(limits.map((row) => row.path));

  for (const limit of limits) {
    const bytes = byPath.get(limit.path);
    if (bytes == null) {
      failures.push({ path: limit.path, reason: "missing", maxBytes: limit.maxBytes });
      continue;
    }
    if (bytes > limit.maxBytes) {
      failures.push({
        path: limit.path,
        reason: "over",
        bytes,
        maxBytes: limit.maxBytes,
      });
    }
  }

  if (!opts.allowUnbudgeted) {
    for (const row of measured) {
      if (!budgeted.has(row.path)) {
        failures.push({ path: row.path, reason: "unbudgeted", bytes: row.bytes });
      }
    }
  }

  return failures;
}

function formatKb(bytes) {
  return `${(bytes / 1000).toFixed(1)} kB`;
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

export function measureRoutes(distDir) {
  const manifestPath = path.join(distDir, "app-build-manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`No app build manifest at ${manifestPath}. Run \`npm run build\` first.`);
  }
  const appManifest = readJson(manifestPath);

  /** @type {Record<string, string[]>} */
  const pages = {};
  for (const [key, files] of Object.entries(appManifest.pages ?? {})) {
    pages[normalizeAppPath(key)] = files;
  }
  // App Router has no pages `_app`. Do not pull pages-router files in from build-manifest;
  // that double-counts and no longer matches the First Load JS column.
  const appFiles = (pages["/_app"] ?? []).filter((file) => file.endsWith(".js"));

  /** @type {Map<string, { parsed: number, gzip: number }>} */
  const sizeCache = new Map();
  const sizeOf = (rel) => {
    const cached = sizeCache.get(rel);
    if (cached != null) return cached;
    const abs = path.join(distDir, rel);
    const measured = { parsed: statSync(abs).size, gzip: gzipSize.fileSync(abs) };
    sizeCache.set(rel, measured);
    return measured;
  };

  /** @type {{ path: string, bytes: number, parsed: number }[]} */
  const routes = [];
  const seen = new Set();
  for (const [key, files] of Object.entries(appManifest.pages ?? {})) {
    if (!isPageEntry(key)) continue;
    const route = normalizeAppPath(key);
    if (seen.has(route)) continue;
    seen.add(route);
    const js = [...new Set([...(files ?? []), ...appFiles])].filter((file) => file.endsWith(".js"));
    let gzip = 0;
    let parsed = 0;
    for (const file of js) {
      const sized = sizeOf(file);
      gzip += sized.gzip;
      parsed += sized.parsed;
    }
    routes.push({ path: route, bytes: gzip, parsed });
  }
  routes.sort((a, b) => a.path.localeCompare(b.path));
  return routes;
}

export function measureAssets(assets) {
  return assets.map((asset) => ({
    path: asset.path,
    bytes: gzipSize.fileSync(asset.path),
    parsed: statSync(asset.path).size,
  }));
}

function walkJs(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const abs = path.join(dir, name);
    if (statSync(abs).isDirectory()) walkJs(abs, out);
    else if (name.endsWith(".js")) out.push(abs);
  }
  return out;
}

/** Sum gzip size of built chunks whose source contains `marker.contains`. */
export function measureMarkers(distDir, markers) {
  const files = walkJs(path.join(distDir, "static", "chunks"));
  const text = new Map();
  const read = (file) => {
    let cached = text.get(file);
    if (cached == null) {
      cached = readFileSync(file, "utf8");
      text.set(file, cached);
    }
    return cached;
  };
  const measured = [];
  for (const marker of markers) {
    const hits = files.filter((file) => read(file).includes(marker.contains));
    if (hits.length === 0) continue;
    let bytes = 0;
    let parsed = 0;
    for (const file of hits) {
      bytes += gzipSize.fileSync(file);
      parsed += statSync(file).size;
    }
    measured.push({ path: marker.id, bytes, parsed });
  }
  return measured;
}

function writeSnapshot(bundles) {
  const snapshotPath = path.resolve("perf/snapshot.json");
  let benches = [];
  if (existsSync(snapshotPath)) {
    try {
      benches = readJson(snapshotPath).benches ?? [];
    } catch {
      benches = [];
    }
  }
  writeFileSync(snapshotPath, `${JSON.stringify({ bundles, benches }, null, 2)}\n`);
}

function snapshotBundles(routes, assets, markers) {
  return [
    ...routes.map((route) => ({ name: route.path, parsed: route.parsed, gzip: route.bytes })),
    ...assets.map((asset) => ({ name: asset.path, parsed: asset.parsed, gzip: asset.bytes })),
    ...markers.map((marker) => ({ name: marker.path, parsed: marker.parsed, gzip: marker.bytes })),
  ];
}

function printRow(label, bytes, maxBytes) {
  const max = maxBytes == null ? "" : `   max ${formatKb(maxBytes)}`;
  console.log(`  ${label.padEnd(32)} ${formatKb(bytes).padStart(10)}${max}`);
}

function main() {
  const printOnly = process.argv.includes("--print");
  const distDir = process.env.NEXT_DIST_DIR || ".next";
  const budgetPath = path.resolve("perf/budgets.json");
  const routes = measureRoutes(distDir);
  const budgets = existsSync(budgetPath) ? readJson(budgetPath) : null;
  const assetLimits = budgets?.assets ?? [];
  const markerLimits = budgets?.markers ?? [];
  const assets = assetLimits.length > 0 ? measureAssets(assetLimits) : [];
  const markers = markerLimits.length > 0 ? measureMarkers(distDir, markerLimits) : [];
  writeSnapshot(snapshotBundles(routes, assets, markers));

  console.log("First-load JS (gzip, level 9 — same number as next build)");
  const maxByRoute = new Map((budgets?.routes ?? []).map((route) => [route.path, route.maxBytes]));
  for (const route of routes) {
    printRow(route.path, route.bytes, maxByRoute.get(route.path));
  }
  if (assets.length > 0 || markerLimits.length > 0) {
    console.log("Other JS (gzip, level 9)");
    const maxByAsset = new Map(assetLimits.map((asset) => [asset.path, asset.maxBytes]));
    for (const asset of assets) {
      printRow(asset.path, asset.bytes, maxByAsset.get(asset.path));
    }
    const maxByMarker = new Map(markerLimits.map((marker) => [marker.id, marker.maxBytes]));
    const markerBytes = new Map(markers.map((marker) => [marker.path, marker.bytes]));
    for (const marker of markerLimits) {
      const bytes = markerBytes.get(marker.id);
      if (bytes == null) console.log(`  ${marker.id.padEnd(32)} ${"missing".padStart(10)}`);
      else printRow(marker.id, bytes, maxByMarker.get(marker.id));
    }
  }

  if (printOnly || !budgets) {
    if (!budgets) console.log("No perf/budgets.json — measurement only.");
    return;
  }

  const markerAsLimits = markerLimits.map((marker) => ({
    path: marker.id,
    maxBytes: marker.maxBytes,
  }));
  const failures = [
    ...evaluateLimits(routes, budgets.routes ?? []),
    ...evaluateLimits(assets, assetLimits, { allowUnbudgeted: true }),
    ...evaluateLimits(markers, markerAsLimits, { allowUnbudgeted: true }),
  ];
  if (failures.length === 0) {
    console.log("Bundle budget ok.");
    return;
  }

  console.error("\nBundle budget failed.");
  for (const failure of failures) {
    if (failure.reason === "over") {
      const delta = failure.bytes - failure.maxBytes;
      console.error(
        `  ${failure.path} is ${formatKb(failure.bytes)}, over the ${formatKb(failure.maxBytes)} budget by ${formatKb(delta)}.`,
      );
    } else if (failure.reason === "unbudgeted") {
      console.error(
        `  ${failure.path} is ${formatKb(failure.bytes)} and has no budget. Add it to perf/budgets.json (ceiling helper: measured bytes rounded up to 1 KiB, plus 8 KiB).`,
      );
    } else {
      console.error(`  ${failure.path} is budgeted but was not in this build.`);
    }
  }
  process.exitCode = 1;
}

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === entry) main();

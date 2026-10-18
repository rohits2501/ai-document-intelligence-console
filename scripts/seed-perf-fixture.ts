/**
 * Writes one large synthetic job plus a 100-row job list into the durable SQLite store.
 * Run: npx tsx scripts/seed-perf-fixture.ts
 * Point every bench server at the same DATA_DIR so they share this fixture.
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { resolveDataDir } from "../src/data-dir";
import { openJobDatabase } from "../src/jobs/db";
import { SqliteDocumentStore, SqliteJobStore } from "../src/jobs/sqlite-store";
import { SqliteEventLog } from "../src/jobs/sqlite-event-log";
import { writeWhole } from "../src/upload/storage";
import type { ExtractedField, Job } from "../src/jobs/types";
import {
  PERF_DOC_ID,
  PERF_EVENT_COUNT,
  PERF_FIELD_COUNT,
  PERF_JOB_ID,
  PERF_LIST_JOB_COUNT,
  PERF_PAGE_COUNT,
} from "../src/perf/ids";

const GROUPS = ["invoice", "seller", "buyer", "line", "totals"] as const;

function buildFields(): ExtractedField[] {
  const fields: ExtractedField[] = [];
  for (let i = 0; i < PERF_FIELD_COUNT; i++) {
    const group = GROUPS[i % GROUPS.length] ?? "invoice";
    const page = (i % PERF_PAGE_COUNT) + 1;
    const col = i % 4;
    const row = Math.floor(i / 4) % 8;
    fields.push({
      key: `${group}_field_${i}`,
      value: `${group}-${i}`,
      confidence: 0.55 + ((i * 7) % 45) / 100,
      page,
      bbox: { x: 0.08 + col * 0.22, y: 0.08 + row * 0.1, w: 0.18, h: 0.06 },
      source: `perf-bench.pdf p${page}`,
    });
  }
  return fields;
}

async function main() {
  const dataDir = resolveDataDir();
  await mkdir(dataDir, { recursive: true });
  const db = openJobDatabase();
  const documents = new SqliteDocumentStore(db);
  const jobs = new SqliteJobStore(db);
  const eventLog = new SqliteEventLog(db);

  const existing = jobs.get(PERF_JOB_ID);
  if (existing && eventLog.latestId(PERF_JOB_ID) >= PERF_EVENT_COUNT) {
    console.log(`fixture already present: ${PERF_JOB_ID} in ${dataDir}`);
    console.log(`open /jobs/${PERF_JOB_ID}`);
    return;
  }

  const storageKey = `${PERF_DOC_ID}.pdf`;
  // Invalid PDF bytes so the viewer falls back to page frames while still using pageCountHint.
  await writeWhole(storageKey, Buffer.from("%PDF-PERF-FIXTURE\n"));
  const now = new Date().toISOString();
  documents.put({
    id: PERF_DOC_ID,
    name: "perf-bench.pdf",
    sizeBytes: 18,
    pageCount: PERF_PAGE_COUNT,
    storageKey,
    createdAt: now,
  });

  const benchJob: Job = {
    id: PERF_JOB_ID,
    documentId: PERF_DOC_ID,
    kind: "extract",
    status: "partially_completed",
    lastEventId: 0,
    createdAt: now,
    updatedAt: now,
    error: null,
  };
  jobs.put(benchJob);

  if (eventLog.latestId(PERF_JOB_ID) === 0) {
    const fields = buildFields();
    eventLog.append(PERF_JOB_ID, "queued", { message: "perf-bench.pdf", attempt: 1 });
    eventLog.append(PERF_JOB_ID, "processing", { totalPages: PERF_PAGE_COUNT });
    for (let page = 1; page <= PERF_PAGE_COUNT; page++) {
      eventLog.append(PERF_JOB_ID, "page_processed", { page, totalPages: PERF_PAGE_COUNT });
    }
    eventLog.append(PERF_JOB_ID, "extraction_started", { totalPages: PERF_PAGE_COUNT });
    for (const field of fields) {
      eventLog.append(PERF_JOB_ID, "partial_result", { fields: [field] });
    }
    const used = 2 + PERF_PAGE_COUNT + 1 + fields.length;
    const extra = PERF_EVENT_COUNT - used - 1;
    for (let i = 0; i < extra; i++) {
      const page = (i % PERF_PAGE_COUNT) + 1;
      eventLog.append(PERF_JOB_ID, "page_processed", { page, totalPages: PERF_PAGE_COUNT });
    }
    eventLog.append(PERF_JOB_ID, "partially_completed", {
      failed: fields
        .filter((f) => f.confidence < 0.7)
        .slice(0, 8)
        .map((f) => f.key),
    });
    jobs.update(PERF_JOB_ID, { lastEventId: eventLog.latestId(PERF_JOB_ID) });
  }

  for (let i = 0; i < PERF_LIST_JOB_COUNT; i++) {
    const id = `job_perf-list-${String(i).padStart(3, "0")}`;
    if (jobs.get(id)) continue;
    const created = new Date(Date.now() - i * 60_000).toISOString();
    jobs.put({
      id,
      documentId: PERF_DOC_ID,
      kind: i % 5 === 0 ? "digitise" : "extract",
      status: i % 7 === 0 ? "processing" : "completed",
      lastEventId: 1,
      createdAt: created,
      updatedAt: created,
      error: null,
    });
  }

  const cardPath = path.join(dataDir, "perf-fixture.json");
  await writeFile(
    cardPath,
    JSON.stringify(
      {
        jobId: PERF_JOB_ID,
        documentId: PERF_DOC_ID,
        pages: PERF_PAGE_COUNT,
        fields: PERF_FIELD_COUNT,
        events: eventLog.latestId(PERF_JOB_ID),
        listJobs: PERF_LIST_JOB_COUNT,
        dataDir,
      },
      null,
      2,
    ),
  );

  console.log(`seeded ${PERF_JOB_ID}`);
  console.log(`events ${eventLog.latestId(PERF_JOB_ID)}`);
  console.log(`dataDir ${dataDir}`);
  console.log(`open /jobs/${PERF_JOB_ID}`);
}

void main();

"use client";

/**
 * Resumable chunked uploader (spec: chunked upload slice). Splits a file into fixed-size chunks and
 * uploads them sequentially with retry + backoff. The uploadId is remembered in IndexedDB keyed by
 * a file fingerprint, so an interrupted upload resumes from the committed offset on the next try,
 * even after a page reload. Supports cancellation via AbortSignal.
 */
const CHUNK_SIZE = 512 * 1024; // 512 KiB
const MAX_RETRIES = 4;

export interface UploadProgress {
  uploaded: number;
  total: number;
  pct: number;
}

export interface UploadHandle {
  documentId: string;
}

function fingerprint(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

// ---- tiny IndexedDB key/value for resume tokens ----
const DB_NAME = "doc-intel-uploads";
const STORE = "sessions";

function idb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

async function idbGet(key: string): Promise<string | null> {
  const db = await idb();
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
    tx.onsuccess = () => resolve((tx.result as string) ?? null);
    tx.onerror = () => resolve(null);
  });
}

async function idbSet(key: string, value: string): Promise<void> {
  const db = await idb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite").objectStore(STORE).put(value, key);
    tx.onsuccess = () => resolve();
    tx.onerror = () => resolve();
  });
}

async function idbDel(key: string): Promise<void> {
  const db = await idb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite").objectStore(STORE).delete(key);
    tx.onsuccess = () => resolve();
    tx.onerror = () => resolve();
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function putChunk(
  uploadId: string,
  offset: number,
  chunk: Blob,
  signal: AbortSignal,
): Promise<number> {
  let attempt = 0;
  // On a 409 offset mismatch the server returns the authoritative offset; we jump to it.
  for (;;) {
    const res = await fetch(`/api/upload/chunk?uploadId=${uploadId}&offset=${offset}`, {
      method: "PUT",
      body: chunk,
      signal,
    });
    if (res.ok) {
      const { received } = (await res.json()) as { received: number };
      return received;
    }
    if (res.status === 409) {
      const { expected } = (await res.json()) as { expected: number };
      return expected; // resume from server's committed offset
    }
    if (++attempt > MAX_RETRIES) {
      throw new Error(`chunk failed at offset ${offset} (${res.status})`);
    }
    await sleep(250 * 2 ** (attempt - 1)); // exponential backoff
  }
}

export async function uploadFileResumable(
  file: File,
  opts: { signal: AbortSignal; onProgress?: (p: UploadProgress) => void },
): Promise<UploadHandle> {
  const fpKey = fingerprint(file);
  const savedId = await idbGet(fpKey);

  const initRes = await fetch("/api/upload/init", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: file.name, size: file.size, uploadId: savedId ?? undefined }),
    signal: opts.signal,
  });
  if (!initRes.ok) throw new Error(`init failed (${initRes.status})`);
  const { uploadId, offset } = (await initRes.json()) as { uploadId: string; offset: number };
  await idbSet(fpKey, uploadId);

  let committed = offset;
  const report = () =>
    opts.onProgress?.({
      uploaded: committed,
      total: file.size,
      pct: file.size === 0 ? 100 : Math.round((committed / file.size) * 100),
    });
  report();

  while (committed < file.size) {
    if (opts.signal.aborted) throw new DOMException("aborted", "AbortError");
    const end = Math.min(committed + CHUNK_SIZE, file.size);
    const chunk = file.slice(committed, end);
    committed = await putChunk(uploadId, committed, chunk, opts.signal);
    report();
  }

  const completeRes = await fetch("/api/upload/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ uploadId }),
    signal: opts.signal,
  });
  if (!completeRes.ok) throw new Error(`complete failed (${completeRes.status})`);
  const { document } = (await completeRes.json()) as { document: { id: string } };
  await idbDel(fpKey);
  return { documentId: document.id };
}

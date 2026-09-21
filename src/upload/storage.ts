import { mkdir, writeFile, appendFile, readFile, stat, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { resolveDataDir } from "@/data-dir";

/**
 * Local disk storage for the demo (spec 0001: no external services). Not a production object store.
 * Shares `resolveDataDir()` with the job database (spec 0005 AC-8): DATA_DIR, then `/tmp` on
 * serverless, then `.data`. Upload bytes live under `<dataDir>/uploads`.
 */
export function storageRoot(): string {
  return path.join(resolveDataDir(), "uploads");
}

async function ensureRoot() {
  const root = storageRoot();
  if (!existsSync(root)) await mkdir(root, { recursive: true });
}

/**
 * Resolve a storage key to an absolute path and refuse anything that escapes ROOT. Defense in depth:
 * even if a caller passes an attacker-influenced key, path traversal (`../`, absolute segments)
 * cannot read or write outside the upload root.
 */
function resolveWithin(storageKey: string): string {
  const root = storageRoot();
  const resolved = path.resolve(root, storageKey);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error("invalid storage key");
  }
  return resolved;
}

export async function writeWhole(storageKey: string, bytes: Buffer): Promise<void> {
  await ensureRoot();
  await writeFile(resolveWithin(storageKey), bytes);
}

export async function appendChunk(storageKey: string, bytes: Buffer): Promise<void> {
  await ensureRoot();
  await appendFile(resolveWithin(storageKey), bytes);
}

export async function currentSize(storageKey: string): Promise<number> {
  try {
    const s = await stat(resolveWithin(storageKey));
    return s.size;
  } catch {
    return 0;
  }
}

export async function readWhole(storageKey: string): Promise<Buffer> {
  return readFile(resolveWithin(storageKey));
}

export function storagePath(storageKey: string): string {
  return resolveWithin(storageKey);
}

export async function writeJson(storageKey: string, value: unknown): Promise<void> {
  await ensureRoot();
  await writeFile(resolveWithin(storageKey), JSON.stringify(value), "utf8");
}

export async function readJson<T>(storageKey: string): Promise<T | null> {
  try {
    const raw = await readFile(resolveWithin(storageKey), "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function removeKey(storageKey: string): Promise<void> {
  try {
    await unlink(resolveWithin(storageKey));
  } catch {
    // already gone
  }
}

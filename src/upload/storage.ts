import { mkdir, writeFile, appendFile, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Local disk storage for the demo (spec 0001: no external services). Not a production object store;
 * the README says so. Files live under `.data/uploads/` and are gitignored.
 */
const ROOT = path.join(process.cwd(), ".data", "uploads");

async function ensureRoot() {
  if (!existsSync(ROOT)) await mkdir(ROOT, { recursive: true });
}

/**
 * Resolve a storage key to an absolute path and refuse anything that escapes ROOT. Defense in depth:
 * even if a caller passes an attacker-influenced key, path traversal (`../`, absolute segments)
 * cannot read or write outside `.data/uploads`.
 */
function resolveWithin(storageKey: string): string {
  const resolved = path.resolve(ROOT, storageKey);
  if (resolved !== ROOT && !resolved.startsWith(ROOT + path.sep)) {
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

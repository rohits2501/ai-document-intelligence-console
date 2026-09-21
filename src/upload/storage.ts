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

export async function writeWhole(storageKey: string, bytes: Buffer): Promise<void> {
  await ensureRoot();
  await writeFile(path.join(ROOT, storageKey), bytes);
}

export async function appendChunk(storageKey: string, bytes: Buffer): Promise<void> {
  await ensureRoot();
  await appendFile(path.join(ROOT, storageKey), bytes);
}

export async function currentSize(storageKey: string): Promise<number> {
  try {
    const s = await stat(path.join(ROOT, storageKey));
    return s.size;
  } catch {
    return 0;
  }
}

export async function readWhole(storageKey: string): Promise<Buffer> {
  return readFile(path.join(ROOT, storageKey));
}

export function storagePath(storageKey: string): string {
  return path.join(ROOT, storageKey);
}

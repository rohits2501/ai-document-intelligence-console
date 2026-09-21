/**
 * In-memory registry of in-flight chunked uploads (demo only). Maps an uploadId to its target
 * storage key and expected size, so chunks append to the right file and `complete` can validate.
 * Stashed on globalThis to survive Next dev hot reloads.
 */
export interface UploadSession {
  uploadId: string;
  storageKey: string;
  name: string;
  size: number;
  createdAt: string;
}

const globalForUploads = globalThis as unknown as {
  __docIntelUploads?: Map<string, UploadSession>;
  __docIntelUploadLocks?: Map<string, Promise<unknown>>;
};

export const uploads: Map<string, UploadSession> =
  globalForUploads.__docIntelUploads ?? (globalForUploads.__docIntelUploads = new Map());

const locks: Map<string, Promise<unknown>> = globalForUploads.__docIntelUploadLocks ??
(globalForUploads.__docIntelUploadLocks = new Map());

/**
 * Serialize work per uploadId. Chunk appends do a read-then-append; without this, two concurrent
 * PUTs at the same offset could both pass the size check and both append, corrupting the file.
 * Running them through a per-session promise chain makes the offset check + append atomic.
 */
export function withUploadLock<T>(uploadId: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(uploadId) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  // keep the chain alive but do not leak rejections into the stored promise
  locks.set(
    uploadId,
    next.then(
      () => undefined,
      () => undefined,
    ),
  );
  return next;
}

/** Drop upload sessions older than the given age (best-effort retention for the in-memory demo). */
export function pruneStaleUploads(maxAgeMs: number): void {
  const now = Date.now();
  for (const [id, session] of uploads) {
    if (now - new Date(session.createdAt).getTime() > maxAgeMs) {
      uploads.delete(id);
      locks.delete(id);
    }
  }
}

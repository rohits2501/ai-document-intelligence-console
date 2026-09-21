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
};

export const uploads: Map<string, UploadSession> =
  globalForUploads.__docIntelUploads ?? (globalForUploads.__docIntelUploads = new Map());

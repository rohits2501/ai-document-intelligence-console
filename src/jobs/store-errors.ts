import { log } from "@/telemetry";

/** Database file could not be opened or migrated. Routes map this to 5xx (spec 0005 AC-7). */
export class StoreOpenError extends Error {
  readonly dbPath: string;

  constructor(dbPath: string, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`store unavailable at ${dbPath}: ${detail}`);
    this.name = "StoreOpenError";
    this.dbPath = dbPath;
    if (cause instanceof Error) this.cause = cause;
  }
}

/** A persisted row failed JSON/zod validation. Fail the request; never skip the row. */
export class StoreDataError extends Error {
  readonly fields: Record<string, unknown>;

  constructor(message: string, fields: Record<string, unknown> = {}, cause?: unknown) {
    super(message);
    this.name = "StoreDataError";
    this.fields = fields;
    if (cause instanceof Error) this.cause = cause;
  }
}

export function isStoreError(err: unknown): err is StoreOpenError | StoreDataError {
  return err instanceof StoreOpenError || err instanceof StoreDataError;
}

/** Map a store failure to a 5xx JSON response, with a structured log that names the path. */
export function storeErrorResponse(err: unknown): Response | null {
  if (err instanceof StoreOpenError) {
    log.error("store:unavailable", { db_path: err.dbPath, error: err.message });
    return Response.json({ error: "store unavailable", db_path: err.dbPath }, { status: 500 });
  }
  if (err instanceof StoreDataError) {
    log.error("store:corrupt-row", { error: err.message, ...err.fields });
    return Response.json({ error: err.message, ...err.fields }, { status: 500 });
  }
  return null;
}

export async function withStore<T>(fn: () => T | Promise<T>): Promise<T | Response> {
  try {
    return await fn();
  } catch (err) {
    const response = storeErrorResponse(err);
    if (response) return response;
    throw err;
  }
}

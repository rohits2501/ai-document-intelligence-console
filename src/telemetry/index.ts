/**
 * Thin structured logging + span helper with correlation ids (spec 0001, and expanded in the
 * Observability slice). Intentionally dependency-free; an OpenTelemetry exporter can be added later
 * behind this same surface.
 */
export interface Correlation {
  request_id?: string;
  job_id?: string;
  document_id?: string;
}

/** Correlation ids plus any extra structured fields. */
export type LogContext = Correlation & { [key: string]: unknown };

export function newRequestId(): string {
  return `req_${crypto.randomUUID()}`;
}

type Level = "debug" | "info" | "warn" | "error";

function emit(level: Level, message: string, ctx: LogContext = {}) {
  const line = JSON.stringify({ level, message, ts: new Date().toISOString(), ...ctx });
  // Single structured line per event; easy to grep by job_id/request_id.
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (m: string, c?: LogContext) => emit("debug", m, c),
  info: (m: string, c?: LogContext) => emit("info", m, c),
  warn: (m: string, c?: LogContext) => emit("warn", m, c),
  error: (m: string, c?: LogContext) => emit("error", m, c),
};

/** Run a function as a timed span, logging start/end with duration and correlation ids. */
export async function span<T>(
  name: string,
  ctx: Correlation,
  fn: () => Promise<T> | T,
): Promise<T> {
  const start = Date.now();
  log.debug(`${name}:start`, { ...ctx });
  try {
    const result = await fn();
    log.info(`${name}:end`, { ...ctx, duration_ms: Date.now() - start });
    return result;
  } catch (err) {
    log.error(`${name}:error`, {
      ...ctx,
      duration_ms: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

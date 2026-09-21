/**
 * Minimal, typed feature flags. Client visible flags come from NEXT_PUBLIC_* env vars so they are
 * readable on both server and client and can be toggled per deployment without a code change.
 * Server only flags (durable store) read FEATURE_* and NODE_ENV. Defaults keep the full demo on.
 */
export interface Flags {
  /** Show the internal Diagnostics panel (correlation ids, stream state) in the job console. */
  diagnostics: boolean;
  /** Allow editing + approving fields in review. When off, review is read-only. */
  reviewEditing: boolean;
  /** Run the guided product walkthrough (spotlight tour) on the home and job console routes. */
  walkthrough: boolean;
  /**
   * Persist jobs, events, documents, and reviews to SQLite. Default on. Off (or NODE_ENV=test)
   * selects the in memory store so tests and ephemeral hosts stay clean (spec 0005 AC-6).
   */
  durableStore: boolean;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value === "1" || value.toLowerCase() === "true";
}

export const flags: Flags = {
  diagnostics: bool(process.env.NEXT_PUBLIC_FEATURE_DIAGNOSTICS, true),
  reviewEditing: bool(process.env.NEXT_PUBLIC_FEATURE_REVIEW_EDITING, true),
  walkthrough: bool(process.env.NEXT_PUBLIC_FEATURE_WALKTHROUGH, true),
  durableStore:
    process.env.NODE_ENV === "test" ? false : bool(process.env.FEATURE_DURABLE_STORE, true),
};

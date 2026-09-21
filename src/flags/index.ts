/**
 * Minimal, typed feature flags. Values come from NEXT_PUBLIC_* env vars so they are readable on
 * both server and client and can be toggled per deployment without a code change. Defaults keep the
 * full demo on. This is the seam where a real flag service (LaunchDarkly, Statsig, etc.) would plug
 * in behind the same `flags` object.
 */
export interface Flags {
  /** Show the internal Diagnostics panel (correlation ids, stream state) in the job console. */
  diagnostics: boolean;
  /** Allow editing + approving fields in review. When off, review is read-only. */
  reviewEditing: boolean;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value === "1" || value.toLowerCase() === "true";
}

export const flags: Flags = {
  diagnostics: bool(process.env.NEXT_PUBLIC_FEATURE_DIAGNOSTICS, true),
  reviewEditing: bool(process.env.NEXT_PUBLIC_FEATURE_REVIEW_EDITING, true),
};

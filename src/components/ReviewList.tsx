"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/ui";
import { flags } from "@/flags";
import type { ExtractedField } from "@/jobs/types";

/**
 * Human-in-the-loop review. Fields arrive from the stream; the operator can edit a value, approve
 * it, or leave it flagged. Anything below the confidence threshold starts flagged for review.
 * Submitting persists the decisions to the review endpoint.
 */
const CONFIDENCE_THRESHOLD = 0.85;

interface RowState {
  key: string;
  value: string;
  confidence: number;
  approved: boolean;
}

export function ReviewList({
  jobId,
  fields,
  selectedKey,
  onSelect,
}: {
  jobId: string;
  fields: ExtractedField[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  const [rows, setRows] = useState<RowState[]>([]);
  const [saved, setSaved] = useState<string | null>(null);
  const [savedFields, setSavedFields] = useState<Map<string, { value: string; approved: boolean }>>(
    new Map(),
  );
  const [busy, setBusy] = useState(false);

  // Fetch any previously submitted review once. Kept in state (not applied directly to rows) so it
  // merges deterministically regardless of whether it arrives before or after the streamed fields.
  useEffect(() => {
    let active = true;
    fetch(`/api/jobs/${jobId}/review`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active || !data?.review) return;
        setSaved(data.review.submittedAt);
        setSavedFields(
          new Map(
            (data.review.fields as RowState[]).map((f) => [
              f.key,
              { value: f.value, approved: f.approved },
            ]),
          ),
        );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [jobId]);

  // Derive rows from incoming fields, preserving live edits, then falling back to a saved review.
  useEffect(() => {
    setRows((prev) => {
      const byKey = new Map(prev.map((r) => [r.key, r]));
      return fields.map((f) => {
        const existing = byKey.get(f.key);
        if (existing) return existing; // keep in-progress edits
        const savedRow = savedFields.get(f.key);
        return {
          key: f.key,
          value: savedRow?.value ?? f.value,
          confidence: f.confidence,
          approved: savedRow?.approved ?? f.confidence >= CONFIDENCE_THRESHOLD,
        };
      });
    });
  }, [fields, savedFields]);

  const approvedCount = useMemo(() => rows.filter((r) => r.approved).length, [rows]);

  function update(key: string, patch: Partial<RowState>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setSaved(null);
  }

  async function submit() {
    setBusy(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fields: rows.map((r) => ({ key: r.key, value: r.value, approved: r.approved })),
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { review: { submittedAt: string } };
        setSaved(data.review.submittedAt);
      }
    } finally {
      setBusy(false);
    }
  }

  if (rows.length === 0) {
    return <p style={{ color: "var(--text-muted)", margin: 0 }}>No fields to review yet.</p>;
  }

  return (
    <div style={{ display: "grid", gap: "var(--space-3)" }}>
      <div style={{ display: "grid", gap: "var(--space-2)" }}>
        {rows.map((r) => {
          const color =
            r.confidence >= CONFIDENCE_THRESHOLD
              ? "var(--status-completed)"
              : r.confidence >= 0.7
                ? "var(--status-partial)"
                : "var(--status-failed)";
          const isSelected = selectedKey === r.key;
          return (
            <div
              key={r.key}
              role="button"
              tabIndex={0}
              aria-pressed={isSelected}
              aria-label={`Review ${r.key}, ${Math.round(r.confidence * 100)} percent confidence`}
              onClick={() => onSelect(r.key)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(r.key);
                }
              }}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: "var(--space-2)",
                alignItems: "center",
                padding: "var(--space-3)",
                border: `1px solid ${isSelected ? "var(--accent)" : "var(--border)"}`,
                borderRadius: "var(--radius-sm)",
                background: "var(--surface-2)",
              }}
            >
              <div style={{ display: "grid", gap: 4 }}>
                <div
                  style={{
                    fontSize: "var(--text-xs)",
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.03em",
                  }}
                >
                  {r.key} <span style={{ color }}>· {Math.round(r.confidence * 100)}%</span>
                </div>
                {flags.reviewEditing ? (
                  <input
                    value={r.value}
                    onChange={(e) => update(r.key, { value: e.target.value })}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      color: "var(--text)",
                      padding: "6px 8px",
                      fontSize: "var(--text-base)",
                      fontFamily: "inherit",
                    }}
                  />
                ) : (
                  <span style={{ fontSize: "var(--text-base)" }}>{r.value}</span>
                )}
              </div>
              <label
                onClick={(e) => e.stopPropagation()}
                style={{
                  display: "inline-flex",
                  gap: 6,
                  alignItems: "center",
                  fontSize: "var(--text-xs)",
                  color: r.approved ? "var(--status-completed)" : "var(--text-muted)",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                <input
                  type="checkbox"
                  checked={r.approved}
                  disabled={!flags.reviewEditing}
                  onChange={(e) => update(r.key, { approved: e.target.checked })}
                />
                {r.approved ? "Approved" : "Flagged"}
              </label>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
          {approvedCount} / {rows.length} approved
          {saved ? ` · saved ${new Date(saved).toLocaleTimeString()}` : ""}
        </span>
        <Button variant="primary" disabled={busy || !flags.reviewEditing} onClick={submit}>
          {busy ? "Saving…" : "Submit review"}
        </Button>
      </div>
    </div>
  );
}

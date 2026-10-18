"use client";

import type { ReactNode } from "react";
import styles from "./ui.module.css";
import type { JobStatus } from "@/jobs/types";

export { Button, type ButtonProps } from "@house/react";

export function Card({ children }: { children: ReactNode }) {
  return <div className={styles.card}>{children}</div>;
}

/**
 * A titled surface. `tourId` sets the `data-tour` hook the walkthrough spotlight targets, and
 * `badge` flags a notable capability inline in the header.
 */
export function Panel({
  title,
  children,
  tourId,
  badge,
}: {
  title: string;
  children: ReactNode;
  tourId?: string;
  badge?: string;
}) {
  return (
    <section className={styles.panel} data-tour={tourId}>
      <header className={styles.panelHeader}>
        <span>{title}</span>
        {badge ? <FeatureBadge label={badge} /> : null}
      </header>
      <div className={styles.panelBody}>{children}</div>
    </section>
  );
}

/** Small pill that flags a notable capability (e.g. "Resumable", "Virtualized"). */
export function FeatureBadge({ label }: { label: string }) {
  return <span className={styles.featureBadge}>{label}</span>;
}

const STATUS_COLOR: Record<JobStatus, string> = {
  queued: "var(--text-muted)",
  processing: "var(--info)",
  partially_completed: "var(--warning)",
  completed: "var(--success)",
  failed: "var(--danger)",
  rejected: "var(--danger)",
};

const STATUS_LABEL: Record<JobStatus, string> = {
  queued: "Queued",
  processing: "Processing",
  partially_completed: "Partial",
  completed: "Completed",
  failed: "Failed",
  rejected: "Rejected",
};

/** Same text StatusBadge shows, so filters and badges stay in step. */
export function statusLabel(status: JobStatus): string {
  return STATUS_LABEL[status];
}

/** Status is never color-only: dot + text label (spec 0003 AC-3). */
export function StatusBadge({ status }: { status: JobStatus }) {
  return (
    <span className={styles.badge} style={{ color: STATUS_COLOR[status] }}>
      <span className={styles.badgeDot} aria-hidden />
      <span style={{ color: "var(--text)" }}>{STATUS_LABEL[status]}</span>
    </span>
  );
}

export function ProgressBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.max(0, Math.min(100, max === 0 ? 0 : (value / max) * 100));
  return (
    <div
      className={styles.progressTrack}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={styles.progressFill} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function FieldRow({
  fieldKey,
  value,
  confidence,
  selected,
  onSelect,
}: {
  fieldKey: string;
  value: string;
  confidence: number;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const color =
    confidence >= 0.85 ? "var(--success)" : confidence >= 0.7 ? "var(--warning)" : "var(--danger)";
  return (
    <div
      className={styles.fieldRow}
      data-selected={selected ? "true" : "false"}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect?.();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div>
        <div className={styles.fieldKey}>{fieldKey}</div>
        <div className={styles.fieldValue}>{value}</div>
      </div>
      <div className={styles.confidence} style={{ color }}>
        {Math.round(confidence * 100)}%
      </div>
    </div>
  );
}

/**
 * A small chip that names where a field came from (document name + page) and, when clicked, selects
 * that field so the viewer highlights its box. Tokens only. Renders nothing when there is no source
 * to point at, so status/source is never conveyed by an empty slot.
 */
export function SourceChip({
  page,
  source,
  documentName,
  onActivate,
}: {
  page?: number | null;
  source?: string | null;
  documentName?: string | null;
  onActivate?: () => void;
}) {
  const pageLabel = page != null ? `p${page}` : (source ?? null);
  if (!pageLabel) return null;

  const label = documentName ? `${documentName} ${pageLabel}` : pageLabel;
  const pageText = page != null ? `page ${page}` : pageLabel;
  const ariaLabel = documentName ? `Source, ${documentName} ${pageText}` : `Source, ${pageText}`;

  return (
    <button
      type="button"
      className={styles.sourceChip}
      aria-label={ariaLabel}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onActivate?.();
      }}
    >
      {label}
    </button>
  );
}

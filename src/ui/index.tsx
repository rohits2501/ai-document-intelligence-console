"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import styles from "./ui.module.css";
import type { JobStatus } from "@/jobs/types";

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "primary" | "danger" }
>(function Button({ variant = "default", className, ...rest }, ref) {
  const cls = [
    styles.button,
    variant === "primary" && styles.primary,
    variant === "danger" && styles.danger,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return <button ref={ref} className={cls} {...rest} />;
});

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
  queued: "var(--status-queued)",
  processing: "var(--status-processing)",
  partially_completed: "var(--status-partial)",
  completed: "var(--status-completed)",
  failed: "var(--status-failed)",
  rejected: "var(--status-failed)",
};

const STATUS_LABEL: Record<JobStatus, string> = {
  queued: "Queued",
  processing: "Processing",
  partially_completed: "Partial",
  completed: "Completed",
  failed: "Failed",
  rejected: "Rejected",
};

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
    confidence >= 0.85
      ? "var(--status-completed)"
      : confidence >= 0.7
        ? "var(--status-partial)"
        : "var(--status-failed)";
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

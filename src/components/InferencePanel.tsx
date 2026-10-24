"use client";

import { useEffect, useId, useState } from "react";
import { Button } from "@/ui";
import type { ExtractedField } from "@/jobs/types";
import { EXPECTED_RESULTS, matchesBaseline } from "@/inference/fixtures";
import {
  InferenceResult,
  PreviewErrorBody,
  type CanonicalFact,
  type FindingSeverity,
  type InferenceFinding,
  type InferencePremise,
  type ScenarioPreset,
} from "@/inference/types";
import styles from "./InferencePanel.module.css";

/**
 * Document inference lab (spec 0008). Asks the preview route to check the job's facts and shows
 * what was violated, what follows, and what the check used. When a live check is slow or
 * unavailable it may show a committed saved example, always labelled as such. The check proves the
 * supplied facts pass the invoice rules; it does not prove the scan, the document, or a payment.
 */

const FALLBACK_WAIT_MS = 8000;

const SCENARIOS: { value: ScenarioPreset; label: string }[] = [
  { value: "live_job", label: "Live job fields (with review edits)" },
  { value: "valid_high_value_invoice", label: "Valid high value invoice" },
  { value: "contradictory_dates_and_math", label: "Contradictory dates and math" },
  { value: "missing_mandatory_evidence", label: "Missing mandatory evidence" },
];

const SEVERITY_LABEL: Record<FindingSeverity, string> = {
  error: "Error",
  warning: "Warning",
  info: "Info",
};
const SEVERITY_COLOR: Record<FindingSeverity, string> = {
  error: "var(--danger)",
  warning: "var(--warning)",
  info: "var(--info)",
};
const SEVERITY_ORDER: Record<FindingSeverity, number> = { error: 0, warning: 1, info: 2 };

const VALIDATION_KINDS = new Set<InferenceFinding["kind"]>([
  "shacl_violation",
  "contradiction",
  "missing_evidence",
]);

const TIER_COPY: Record<string, string> = {
  senior_signoff: "Senior signoff",
  standard_signoff: "Standard signoff",
};
const TIER_NOTE = "Derived review tier from the total. This is not a decision to pay.";
const STATE_NOTE = "Derived from the GSTIN prefix. This is not a tax filing.";

const DERIVED_LABEL: Partial<Record<CanonicalFact["predicate"], string>> = {
  "doc:hasApprovalTier": "Review tier",
  "doc:hasVendorStateCode": "Vendor state code",
};

type View =
  | { phase: "loading" }
  | { phase: "live"; result: InferenceResult }
  | { phase: "saved"; result: InferenceResult }
  /** `baselineAllowed`: live job, no saved review. Shows the baseline once fields match it. */
  | { phase: "error"; message: string; baselineAllowed: boolean };

type Attempt =
  | { ok: true; result: InferenceResult }
  | { ok: false; fallback: boolean; message: string };

async function requestPreview(
  jobId: string,
  scenario: ScenarioPreset,
  signal: AbortSignal,
): Promise<Attempt> {
  let res: Response;
  try {
    res = await fetch("/api/inference/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId, scenarioPreset: scenario }),
      signal,
    });
  } catch {
    return { ok: false, fallback: true, message: "The live check did not respond." };
  }
  const body: unknown = await res.json().catch(() => null);
  if (res.ok) {
    const parsed = InferenceResult.safeParse(body);
    if (parsed.success) return { ok: true, result: parsed.data };
    return {
      ok: false,
      fallback: false,
      message: "The check returned a result the lab cannot read.",
    };
  }
  const error = PreviewErrorBody.safeParse(body);
  const message = error.success ? error.data.message : `The check failed (${res.status}).`;
  return { ok: false, fallback: res.status === 501 || res.status === 502, message };
}

/** True only when the review endpoint confirms there is no saved review. */
async function reviewIsAbsent(jobId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/jobs/${jobId}/review`);
    if (!res.ok) return false;
    const data = (await res.json()) as { review?: unknown };
    return !data.review;
  } catch {
    return false;
  }
}

export function InferencePanel({
  jobId,
  fields,
  selectedKey,
  onSelectField,
}: {
  jobId: string;
  fields: ExtractedField[];
  selectedKey: string | null;
  onSelectField: (fieldKey: string) => void;
}) {
  const [scenario, setScenario] = useState<ScenarioPreset>("live_job");
  const [run, setRun] = useState(0);
  const [view, setView] = useState<View>({ phase: "loading" });
  const selectId = useId();

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    const timer = setTimeout(() => controller.abort(), FALLBACK_WAIT_MS);
    setView({ phase: "loading" });

    (async () => {
      const attempt = await requestPreview(jobId, scenario, controller.signal);
      clearTimeout(timer);
      if (cancelled) return;
      if (attempt.ok) {
        setView({ phase: "live", result: attempt.result });
      } else if (attempt.fallback && scenario !== "live_job") {
        setView({ phase: "saved", result: EXPECTED_RESULTS[scenario] });
      } else {
        const baselineAllowed =
          attempt.fallback && scenario === "live_job" && (await reviewIsAbsent(jobId));
        if (cancelled) return;
        setView({ phase: "error", message: attempt.message, baselineAllowed });
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [jobId, scenario, run]);

  // The stream may still be replaying when the live check fails, so re-test as fields arrive.
  const shown: View =
    view.phase === "error" && view.baselineAllowed && matchesBaseline(fields)
      ? { phase: "saved", result: EXPECTED_RESULTS.baseline_mock }
      : view;
  const result = shown.phase === "live" || shown.phase === "saved" ? shown.result : null;

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarGroup}>
          <label className={styles.scenario} htmlFor={selectId}>
            Scenario
          </label>
          <select
            id={selectId}
            className={styles.select}
            value={scenario}
            onChange={(e) => setScenario(e.target.value as ScenarioPreset)}
          >
            {SCENARIOS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.toolbarGroup}>
          <CheckStatus view={shown} />
          <Button
            size="sm"
            disabled={shown.phase === "loading"}
            onClick={() => setRun((n) => n + 1)}
          >
            Check again
          </Button>
        </div>
      </div>

      <p className={styles.note}>
        Turns the fields into facts linked to their page, checks them against the invoice rules, and
        shows what follows. A missing fact stays unknown. The check does not prove the scan, the
        document, or a payment.
      </p>

      {shown.phase === "saved" ? (
        <div className={styles.banner} role="status">
          <span className={styles.bannerTitle}>Saved example, not a live check</span>
          <span>
            The live check was slow or unavailable, so this is the committed result for this case.
          </span>
        </div>
      ) : null}

      {shown.phase === "loading" ? (
        <div className={styles.loading} role="status">
          Checking facts
        </div>
      ) : null}

      {shown.phase === "error" ? (
        <div className={styles.error} role="alert">
          {shown.message} No conclusion is shown.
        </div>
      ) : null}

      {result ? (
        <>
          <div className={styles.sections}>
            <ValidationSection
              findings={result.findings}
              selectedKey={selectedKey}
              onSelectField={onSelectField}
            />
            <DerivedSection
              result={result}
              selectedKey={selectedKey}
              onSelectField={onSelectField}
            />
          </div>
          <CheckDetails result={result} saved={shown.phase === "saved"} />
        </>
      ) : null}
    </div>
  );
}

function DotLabel({ color, label }: { color: string; label: string }) {
  return (
    <span className={styles.dotLabel} style={{ color }}>
      <span className={styles.dot} aria-hidden />
      <span className={styles.dotText}>{label}</span>
    </span>
  );
}

function CheckStatus({ view }: { view: View }) {
  if (view.phase === "loading")
    return <DotLabel color="var(--text-muted)" label="Checking facts" />;
  if (view.phase === "error") return <DotLabel color="var(--danger)" label="Not checked" />;
  return view.result.certificate.status === "rejected" ? (
    <DotLabel color="var(--danger)" label="Checked, rules failed" />
  ) : (
    <DotLabel color="var(--success)" label="Checked" />
  );
}

function PremiseButton({
  premise,
  selectedKey,
  onSelectField,
}: {
  premise: InferencePremise;
  selectedKey: string | null;
  onSelectField: (fieldKey: string) => void;
}) {
  const missing = premise.value === null;
  const text = missing
    ? `${premise.label}: missing`
    : `${premise.label}: ${premise.value}${premise.page != null ? ` · p${premise.page}` : ""}`;
  return (
    <button
      type="button"
      className={missing ? `${styles.premise} ${styles.premiseMissing}` : styles.premise}
      aria-pressed={selectedKey === premise.fieldKey}
      title={text}
      onClick={() => onSelectField(premise.fieldKey)}
    >
      {text}
    </button>
  );
}

function Premises({
  premises,
  selectedKey,
  onSelectField,
}: {
  premises: InferencePremise[];
  selectedKey: string | null;
  onSelectField: (fieldKey: string) => void;
}) {
  if (premises.length === 0) return null;
  return (
    <div className={styles.premises}>
      <span>Evidence</span>
      {premises.map((p) => (
        <PremiseButton
          key={`${p.fieldKey}:${p.factId ?? "missing"}`}
          premise={p}
          selectedKey={selectedKey}
          onSelectField={onSelectField}
        />
      ))}
    </div>
  );
}

function ValidationSection({
  findings,
  selectedKey,
  onSelectField,
}: {
  findings: InferenceFinding[];
  selectedKey: string | null;
  onSelectField: (fieldKey: string) => void;
}) {
  const items = findings
    .filter((f) => VALIDATION_KINDS.has(f.kind))
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  return (
    <section className={styles.section} aria-labelledby="inference-validation">
      <h2 id="inference-validation" className={styles.sectionTitle}>
        Validation and contradictions
      </h2>
      {items.length === 0 ? (
        <p className={styles.empty}>No rule failed and no evidence is missing.</p>
      ) : (
        <ul className={styles.list}>
          {items.map((f) => (
            <li key={f.id} className={styles.item}>
              <div className={styles.itemHead}>
                <DotLabel color={SEVERITY_COLOR[f.severity]} label={SEVERITY_LABEL[f.severity]} />
                <span className={styles.itemTitle}>{f.title}</span>
                <span className={styles.ruleId}>{f.ruleId}</span>
              </div>
              <p className={styles.explanation}>{f.explanation}</p>
              <Premises
                premises={f.premises}
                selectedKey={selectedKey}
                onSelectField={onSelectField}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DerivedSection({
  result,
  selectedKey,
  onSelectField,
}: {
  result: InferenceResult;
  selectedKey: string | null;
  onSelectField: (fieldKey: string) => void;
}) {
  const premisesFor = (fact: CanonicalFact) =>
    result.findings.find(
      (f) =>
        f.kind === "inferred_conclusion" &&
        f.ruleId === fact.provenance.ruleId &&
        f.conclusion?.predicate === fact.predicate,
    )?.premises ?? [];

  return (
    <section className={styles.section} aria-labelledby="inference-derived">
      <h2 id="inference-derived" className={styles.sectionTitle}>
        Derived conclusions
      </h2>
      {result.inferredFacts.length === 0 ? (
        <p className={styles.empty}>No conclusion follows from these facts.</p>
      ) : (
        <ul className={styles.list}>
          {result.inferredFacts.map((fact) => {
            const isTier = fact.predicate === "doc:hasApprovalTier";
            const value = isTier
              ? (TIER_COPY[fact.object.value] ?? fact.object.value)
              : fact.object.value;
            return (
              <li key={fact.id} className={styles.item}>
                <div className={styles.itemHead}>
                  <DotLabel color={SEVERITY_COLOR.info} label={SEVERITY_LABEL.info} />
                  <span className={styles.itemTitle}>
                    {DERIVED_LABEL[fact.predicate] ?? fact.predicate}
                  </span>
                  <span className={styles.ruleId}>{fact.provenance.ruleId}</span>
                </div>
                <span className={styles.value}>{value}</span>
                <p className={styles.note}>
                  {isTier ? TIER_NOTE : STATE_NOTE} Confidence {Math.round(fact.confidence * 100)}%.
                </p>
                <Premises
                  premises={premisesFor(fact)}
                  selectedKey={selectedKey}
                  onSelectField={onSelectField}
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function CheckDetails({ result, saved }: { result: InferenceResult; saved: boolean }) {
  const { certificate } = result;
  return (
    <details className={styles.details}>
      <summary className={styles.summary}>Graph and check details</summary>
      <div className={styles.detailsBody}>
        <dl className={styles.meta}>
          <dt>Engine</dt>
          <dd>{certificate.engineUsed}</dd>
          <dt>Ontology</dt>
          <dd>{certificate.ontologyVersion}</dd>
          <dt>Input hash</dt>
          <dd>{certificate.inputHash}</dd>
          <dt>Live duration</dt>
          <dd>{saved ? "Not measured, saved example" : `${certificate.durationMs} ms`}</dd>
        </dl>
        <table className={styles.facts}>
          <caption className={styles.caption}>Facts the check used</caption>
          <thead>
            <tr>
              <th scope="col">Predicate</th>
              <th scope="col">Value</th>
              <th scope="col">Origin</th>
              <th scope="col">Field</th>
              <th scope="col">Page</th>
            </tr>
          </thead>
          <tbody>
            {result.canonicalFacts.map((f) => (
              <tr key={f.id}>
                <td>{f.predicate}</td>
                <td>{f.object.value}</td>
                <td>{f.provenance.origin}</td>
                <td>{f.provenance.fieldKey}</td>
                <td>{f.provenance.page ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <pre className={styles.turtle} aria-label="Turtle graph">
          {result.turtleGraph}
        </pre>
      </div>
    </details>
  );
}

import { z } from "zod";
import { BBox } from "@/jobs/types";

/**
 * Inference lab contract (spec 0008). Zod guards what comes in (the preview body, CLI stdout); the
 * invoice ontology and its rules decide what goes out. Nothing here is a JobEvent or an
 * ExtractedField: inference reads the job, it never writes to it.
 */

export const PREDICATES = [
  "doc:hasDocumentType",
  "doc:hasInvoiceNumber",
  "doc:hasInvoiceDate",
  "doc:hasDueDate",
  "doc:hasVendorName",
  "doc:hasTotalAmountPaise",
  "doc:hasSubtotalPaise",
  "doc:hasTaxAmountPaise",
  "doc:hasCurrency",
  "doc:hasVendorGstin",
  "doc:hasVendorStateCode",
  "doc:hasApprovalTier",
  "doc:hasComplianceStatus",
] as const;
export const Predicate = z.enum(PREDICATES);
export type Predicate = z.infer<typeof Predicate>;

export const FactOrigin = z.enum(["extracted", "reviewed", "inferred"]);
export type FactOrigin = z.infer<typeof FactOrigin>;

export const FactProvenance = z.object({
  documentId: z.string(),
  jobId: z.string(),
  fieldKey: z.string(),
  page: z.number().nullable(),
  bbox: BBox.nullable(),
  source: z.string().nullable(),
  origin: FactOrigin,
  ruleId: z.string().optional(),
});
export type FactProvenance = z.infer<typeof FactProvenance>;

export const FactObject = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("entity"), value: z.string() }),
  z.object({ kind: z.literal("literal"), value: z.string(), datatype: z.string() }),
]);
export type FactObject = z.infer<typeof FactObject>;

export const CanonicalFact = z.object({
  id: z.string(),
  subjectId: z.string(),
  predicate: Predicate,
  object: FactObject,
  confidence: z.number().min(0).max(1),
  provenance: FactProvenance,
});
export type CanonicalFact = z.infer<typeof CanonicalFact>;

export const InferencePremise = z.object({
  factId: z.string().nullable(),
  fieldKey: z.string(),
  label: z.string(),
  value: z.string().nullable(),
  page: z.number().nullable(),
  source: z.string().nullable(),
});
export type InferencePremise = z.infer<typeof InferencePremise>;

export const FindingKind = z.enum([
  "shacl_violation",
  "contradiction",
  "missing_evidence",
  "inferred_conclusion",
]);
export type FindingKind = z.infer<typeof FindingKind>;

export const FindingSeverity = z.enum(["error", "warning", "info"]);
export type FindingSeverity = z.infer<typeof FindingSeverity>;

export const InferenceFinding = z.object({
  id: z.string(),
  kind: FindingKind,
  severity: FindingSeverity,
  ruleId: z.string(),
  title: z.string(),
  explanation: z.string(),
  premises: z.array(InferencePremise),
  conclusion: z.object({ predicate: Predicate, value: z.string() }).optional(),
});
export type InferenceFinding = z.infer<typeof InferenceFinding>;

export const ENGINE_IDS = ["ts-symbolic-engine", "open-ontologies-cli"] as const;
export const EngineId = z.enum(ENGINE_IDS);
export type EngineId = z.infer<typeof EngineId>;

export const CertificateStatus = z.object({
  /** `not_checked` is reserved; no Phase 1 path sets it. */
  status: z.enum(["verified", "rejected", "not_checked"]),
  engineUsed: EngineId,
  ontologyVersion: z.string(),
  inputHash: z.string(),
  durationMs: z.number().int().nonnegative(),
});
export type CertificateStatus = z.infer<typeof CertificateStatus>;

/** What either engine returns. The route builds the rest of the result itself. */
export const EngineOutput = z.object({
  inferredFacts: z.array(CanonicalFact),
  findings: z.array(InferenceFinding),
});
export type EngineOutput = z.infer<typeof EngineOutput>;

export const InferenceResult = z.object({
  jobId: z.string(),
  documentId: z.string(),
  canonicalFacts: z.array(CanonicalFact),
  inferredFacts: z.array(CanonicalFact),
  findings: z.array(InferenceFinding),
  turtleGraph: z.string(),
  certificate: CertificateStatus,
});
export type InferenceResult = z.infer<typeof InferenceResult>;

export const SCENARIO_PRESETS = [
  "live_job",
  "valid_high_value_invoice",
  "contradictory_dates_and_math",
  "missing_mandatory_evidence",
] as const;
export const ScenarioPreset = z.enum(SCENARIO_PRESETS);
export type ScenarioPreset = z.infer<typeof ScenarioPreset>;
export type SyntheticPreset = Exclude<ScenarioPreset, "live_job">;

export const PreviewBody = z.object({
  jobId: z.string().min(1),
  scenarioPreset: ScenarioPreset.default("live_job"),
});
export type PreviewBody = z.infer<typeof PreviewBody>;

export const INFERENCE_ERROR_CODES = [
  "not_configured",
  "binary_missing",
  "timeout",
  "crashed",
  "bad_output",
  "aborted",
] as const;
export const InferenceErrorCode = z.enum(INFERENCE_ERROR_CODES);
export type InferenceErrorCode = z.infer<typeof InferenceErrorCode>;

export const INFERENCE_ERROR_MESSAGES: Record<InferenceErrorCode, string> = {
  not_configured: "Inference HTTP backend is not configured in this phase.",
  binary_missing: "The open-ontologies binary was not found.",
  timeout: "The inference engine timed out.",
  crashed: "The inference engine crashed.",
  bad_output: "The inference engine returned output that is not a result.",
  aborted: "The inference engine was aborted.",
};

/** An engine failure. Never an InferenceResult; the route maps it to 501 or 502. */
export class InferenceEngineError extends Error {
  readonly code: InferenceErrorCode;

  constructor(code: InferenceErrorCode) {
    super(INFERENCE_ERROR_MESSAGES[code]);
    this.name = "InferenceEngineError";
    this.code = code;
  }
}

/** Error body for every non 200 preview response. */
export const PreviewErrorBody = z.object({ error: z.string(), message: z.string() });
export type PreviewErrorBody = z.infer<typeof PreviewErrorBody>;

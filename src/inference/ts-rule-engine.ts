import type { EngineInput, InferenceEngine } from "./engine";
import { FIELD_KEY_MAP, factId, labelForPredicate, subjectIdFor } from "./normalize-facts";
import {
  GSTIN_PATTERN_SOURCE,
  GST_STATE_BY_PREFIX,
  LOW_CONFIDENCE_CUTOFF,
  RULE_IDS,
  SENIOR_SIGNOFF_MIN_PAISE,
} from "./ontology";
import {
  InferenceEngineError,
  type CanonicalFact,
  type EngineOutput,
  type FindingKind,
  type FindingSeverity,
  type InferenceFinding,
  type InferencePremise,
  type Predicate,
} from "./types";

/**
 * The default checker (`ts-symbolic-engine`). Evaluates the spec 0008 rule table in code over the
 * canonical facts: no process, no temp directory, no model. Same facts in, same findings out.
 */

const REQUIRED_PREDICATES: readonly Predicate[] = [
  "doc:hasInvoiceNumber",
  "doc:hasInvoiceDate",
  "doc:hasVendorName",
  "doc:hasTotalAmountPaise",
];

const GSTIN_PATTERN = new RegExp(GSTIN_PATTERN_SOURCE);

const SEVERITY: Record<FindingKind, FindingSeverity> = {
  shacl_violation: "error",
  contradiction: "error",
  missing_evidence: "warning",
  inferred_conclusion: "info",
};

function fieldKeyForPredicate(predicate: Predicate): string {
  for (const [key, spec] of Object.entries(FIELD_KEY_MAP)) {
    if (spec.predicate === predicate) return key;
  }
  return predicate;
}

function premiseOf(fact: CanonicalFact): InferencePremise {
  return {
    factId: fact.id,
    fieldKey: fact.provenance.fieldKey,
    label: labelForPredicate(fact.predicate),
    value: fact.object.value,
    page: fact.provenance.page,
    source: fact.provenance.source,
  };
}

/** A premise the rule needed and the document did not supply. Unknown, not false. */
function absentPremise(predicate: Predicate): InferencePremise {
  return {
    factId: null,
    fieldKey: fieldKeyForPredicate(predicate),
    label: labelForPredicate(predicate),
    value: null,
    page: null,
    source: null,
  };
}

function finding(
  kind: FindingKind,
  ruleId: string,
  title: string,
  explanation: string,
  premises: InferencePremise[],
  extra: { idSuffix?: string; conclusion?: InferenceFinding["conclusion"] } = {},
): InferenceFinding {
  const keys = premises.map((p) => p.fieldKey).sort();
  const id = `finding:${[kind, ruleId, keys.join("+")].join(":")}${
    extra.idSuffix ? `:${extra.idSuffix}` : ""
  }`;
  return {
    id,
    kind,
    severity: SEVERITY[kind],
    ruleId,
    title,
    explanation,
    premises,
    ...(extra.conclusion ? { conclusion: extra.conclusion } : {}),
  };
}

interface Derivation {
  fact: CanonicalFact;
  premises: CanonicalFact[];
}

function derive(
  subjectId: string,
  predicate: Predicate,
  value: string,
  ruleId: string,
  premises: [CanonicalFact, ...CanonicalFact[]],
): Derivation {
  const anchor = premises[0];
  return {
    fact: {
      id: factId(subjectId, predicate, "inferred", ruleId),
      subjectId,
      predicate,
      object: { kind: "literal", value, datatype: "xsd:string" },
      confidence: Math.min(...premises.map((p) => p.confidence)),
      provenance: { ...anchor.provenance, origin: "inferred", ruleId },
    },
    premises,
  };
}

export function evaluateRules(
  input: Pick<EngineInput, "documentId" | "facts" | "approvals">,
): EngineOutput {
  const byPredicate = new Map(input.facts.map((f) => [f.predicate, f]));
  const findings: InferenceFinding[] = [];
  const derivations: Derivation[] = [];
  const subjectId = subjectIdFor(input.documentId);

  for (const predicate of REQUIRED_PREDICATES) {
    if (byPredicate.has(predicate)) continue;
    const label = labelForPredicate(predicate);
    const premises = [absentPremise(predicate)];
    const explanation = `Required field ${label} is missing.`;
    findings.push(
      finding(
        "shacl_violation",
        RULE_IDS.required,
        "Missing required field",
        explanation,
        premises,
      ),
      finding(
        "missing_evidence",
        RULE_IDS.required,
        "Missing required field",
        explanation,
        premises,
      ),
    );
  }

  const gstin = byPredicate.get("doc:hasVendorGstin");
  const gstinValid = gstin ? GSTIN_PATTERN.test(gstin.object.value) : false;
  if (gstin && !gstinValid) {
    findings.push(
      finding(
        "shacl_violation",
        RULE_IDS.gstinFormat,
        "GSTIN format is not valid",
        `GSTIN ${gstin.object.value} does not match the 15 character pattern.`,
        [premiseOf(gstin)],
      ),
    );
  }

  const invoiceDate = byPredicate.get("doc:hasInvoiceDate");
  const dueDate = byPredicate.get("doc:hasDueDate");
  if (invoiceDate && dueDate && dueDate.object.value < invoiceDate.object.value) {
    findings.push(
      finding(
        "contradiction",
        RULE_IDS.dateOrder,
        "Due date is before the invoice date",
        `Due date ${dueDate.object.value} is before invoice date ${invoiceDate.object.value}.`,
        [premiseOf(dueDate), premiseOf(invoiceDate)],
      ),
    );
  }

  const total = byPredicate.get("doc:hasTotalAmountPaise");
  const subtotal = byPredicate.get("doc:hasSubtotalPaise");
  const tax = byPredicate.get("doc:hasTaxAmountPaise");
  if (total && subtotal && tax) {
    const delta =
      BigInt(total.object.value) - (BigInt(subtotal.object.value) + BigInt(tax.object.value));
    if (delta !== 0n) {
      findings.push(
        finding(
          "contradiction",
          RULE_IDS.totalReconciliation,
          "Total does not reconcile",
          `Subtotal plus tax does not equal the total. Delta ${delta} paise.`,
          [premiseOf(subtotal), premiseOf(tax), premiseOf(total)],
        ),
      );
    }
  }

  if (total) {
    const tier =
      BigInt(total.object.value) >= SENIOR_SIGNOFF_MIN_PAISE
        ? "senior_signoff"
        : "standard_signoff";
    const d = derive(subjectId, "doc:hasApprovalTier", tier, RULE_IDS.approvalTier, [total]);
    derivations.push(d);
    findings.push(
      finding(
        "inferred_conclusion",
        RULE_IDS.approvalTier,
        "Derived conclusion",
        `Total ${total.object.value} paise gives review tier ${tier}.`,
        [premiseOf(total)],
        { conclusion: { predicate: "doc:hasApprovalTier", value: tier } },
      ),
    );
  }

  if (!gstin) {
    findings.push(
      finding(
        "missing_evidence",
        RULE_IDS.gstState,
        "GSTIN is missing",
        "GSTIN is missing, so no state can be derived.",
        [absentPremise("doc:hasVendorGstin")],
      ),
    );
  } else if (gstinValid) {
    const prefix = gstin.object.value.slice(0, 2);
    const state = GST_STATE_BY_PREFIX[prefix];
    if (state) {
      const d = derive(subjectId, "doc:hasVendorStateCode", state, RULE_IDS.gstState, [gstin]);
      derivations.push(d);
      findings.push(
        finding(
          "inferred_conclusion",
          RULE_IDS.gstState,
          "Derived conclusion",
          `GSTIN prefix ${prefix} gives state ${state}.`,
          [premiseOf(gstin)],
          { conclusion: { predicate: "doc:hasVendorStateCode", value: state } },
        ),
      );
    } else {
      findings.push(
        finding(
          "missing_evidence",
          RULE_IDS.gstState,
          "State code is unknown",
          "State code is unknown for this GSTIN prefix.",
          [premiseOf(gstin)],
        ),
      );
    }
  }

  for (const { fact, premises } of derivations) {
    const derivedLabel = labelForPredicate(fact.predicate);
    for (const premise of premises) {
      if (premise.confidence >= LOW_CONFIDENCE_CUTOFF) continue;
      if (input.approvals.get(premise.provenance.fieldKey) === true) continue;
      const label = labelForPredicate(premise.predicate);
      findings.push(
        finding(
          "missing_evidence",
          RULE_IDS.provenanceConfidence,
          "Low confidence premise",
          `${label} has confidence ${premise.confidence} and is not approved. ${derivedLabel} depends on it.`,
          [premiseOf(premise)],
          { idSuffix: fact.predicate },
        ),
      );
    }
  }

  return { inferredFacts: derivations.map((d) => d.fact), findings };
}

export class DeterministicTsInferenceEngine implements InferenceEngine {
  readonly id = "ts-symbolic-engine" as const;

  async infer(input: EngineInput): Promise<EngineOutput> {
    if (input.signal.aborted) throw new InferenceEngineError("aborted");
    return evaluateRules(input);
  }
}

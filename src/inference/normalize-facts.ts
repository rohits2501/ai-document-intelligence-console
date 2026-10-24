import type { ExtractedField } from "@/jobs/types";
import type { ReviewedField } from "@/jobs/review-store";
import { PREDICATES, type CanonicalFact, type FactProvenance, type Predicate } from "./types";

/**
 * Turns candidate fields (plus saved review edits on the live job) into canonical facts, one per
 * predicate, each linked to its page, box, and source. A value that does not parse, or a key
 * outside the field key map, produces no fact and a diagnostic. Absence is never stored as false.
 */

type Datatype = "xsd:string" | "xsd:date" | "xsd:integer";
type ParseKind = "string" | "date" | "money";

interface FieldSpec {
  predicate: Predicate;
  datatype: Datatype;
  label: string;
  parse: ParseKind;
}

export const FIELD_KEY_MAP: Readonly<Record<string, FieldSpec>> = {
  document_type: {
    predicate: "doc:hasDocumentType",
    datatype: "xsd:string",
    label: "Document type",
    parse: "string",
  },
  invoice_number: {
    predicate: "doc:hasInvoiceNumber",
    datatype: "xsd:string",
    label: "Invoice number",
    parse: "string",
  },
  invoice_date: {
    predicate: "doc:hasInvoiceDate",
    datatype: "xsd:date",
    label: "Invoice date",
    parse: "date",
  },
  due_date: { predicate: "doc:hasDueDate", datatype: "xsd:date", label: "Due date", parse: "date" },
  vendor_name: {
    predicate: "doc:hasVendorName",
    datatype: "xsd:string",
    label: "Vendor name",
    parse: "string",
  },
  total_amount: {
    predicate: "doc:hasTotalAmountPaise",
    datatype: "xsd:integer",
    label: "Total",
    parse: "money",
  },
  subtotal_amount: {
    predicate: "doc:hasSubtotalPaise",
    datatype: "xsd:integer",
    label: "Subtotal",
    parse: "money",
  },
  tax_amount: {
    predicate: "doc:hasTaxAmountPaise",
    datatype: "xsd:integer",
    label: "Tax",
    parse: "money",
  },
  currency: {
    predicate: "doc:hasCurrency",
    datatype: "xsd:string",
    label: "Currency",
    parse: "string",
  },
  gstin: {
    predicate: "doc:hasVendorGstin",
    datatype: "xsd:string",
    label: "GSTIN",
    parse: "string",
  },
};

const MONEY_KEYS = ["total_amount", "subtotal_amount", "tax_amount"] as const;

const INFERRED_LABELS: Partial<Record<Predicate, string>> = {
  "doc:hasApprovalTier": "Review tier",
  "doc:hasVendorStateCode": "Vendor state code",
  "doc:hasComplianceStatus": "Compliance status",
};

export function labelForPredicate(predicate: Predicate): string {
  const inferred = INFERRED_LABELS[predicate];
  if (inferred) return inferred;
  for (const spec of Object.values(FIELD_KEY_MAP)) {
    if (spec.predicate === predicate) return spec.label;
  }
  return predicate;
}

export function labelForFieldKey(fieldKey: string): string {
  return FIELD_KEY_MAP[fieldKey]?.label ?? fieldKey;
}

export type DiagnosticReason = "Unmapped field" | "Invalid amount" | "Invalid date" | "Empty value";

export interface NormalizeDiagnostic {
  fieldKey: string;
  reason: DiagnosticReason;
}

export interface NormalizeInput {
  documentId: string;
  jobId: string;
  fields: readonly ExtractedField[];
  /** Live job only. Synthetic presets pass no review. */
  review?: { fields: readonly ReviewedField[] } | null;
}

export interface NormalizeOutput {
  facts: CanonicalFact[];
  diagnostics: NormalizeDiagnostic[];
}

export function subjectIdFor(documentId: string): string {
  return `doc:${documentId}`;
}

export function factId(
  subjectId: string,
  predicate: Predicate,
  origin: FactProvenance["origin"],
  ruleId?: string,
): string {
  const base = `fact:${[subjectId, predicate, origin].join(":")}`;
  return ruleId ? `${base}:${ruleId}` : base;
}

/** `₹1,24,500.00` → `{ paise: "12450000", rupee: true }`. Null when it is not a valid amount. */
export function parsePaise(raw: string): { paise: string; rupee: boolean } | null {
  const rupee = raw.includes("₹");
  const cleaned = raw.replace(/[₹\s,]/g, "");
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const whole = BigInt(match[1] ?? "0");
  const fraction = BigInt((match[2] ?? "").padEnd(2, "0"));
  return { paise: (whole * 100n + fraction).toString(), rupee };
}

/** The whole string is `YYYY-MM-DD` and names a real calendar day. No time zone. */
export function isCalendarDate(raw: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

interface Candidate {
  key: string;
  value: string;
  confidence: number;
  page: number | null;
  bbox: ExtractedField["bbox"];
  source: string | null;
  origin: "extracted" | "reviewed";
}

/** Review value wins over the extracted value; page, box, source, and confidence stay extracted. */
function candidatesFor(input: NormalizeInput): Candidate[] {
  const extracted = new Map(input.fields.map((f) => [f.key, f]));
  const reviewed = new Map((input.review?.fields ?? []).map((f) => [f.key, f]));
  const keys = [...extracted.keys()];
  for (const key of reviewed.keys()) if (!extracted.has(key)) keys.push(key);

  const out: Candidate[] = [];
  for (const key of keys) {
    const field = extracted.get(key);
    const review = reviewed.get(key);
    if (review) {
      if (review.value.trim() === "") continue;
      out.push({
        key,
        value: review.value,
        confidence: field?.confidence ?? 1,
        page: field?.page ?? null,
        bbox: field?.bbox ?? null,
        source: field?.source ?? null,
        origin: "reviewed",
      });
    } else if (field) {
      out.push({
        key,
        value: field.value,
        confidence: field.confidence,
        page: field.page,
        bbox: field.bbox,
        source: field.source,
        origin: "extracted",
      });
    }
  }
  return out;
}

export function normalizeFacts(input: NormalizeInput): NormalizeOutput {
  const subjectId = subjectIdFor(input.documentId);
  const facts = new Map<Predicate, CanonicalFact>();
  const diagnostics: NormalizeDiagnostic[] = [];
  const rupeeAmounts = new Map<string, Candidate>();

  const provenanceOf = (c: Candidate): FactProvenance => ({
    documentId: input.documentId,
    jobId: input.jobId,
    fieldKey: c.key,
    page: c.page,
    bbox: c.bbox,
    source: c.source,
    origin: c.origin,
  });

  const put = (c: Candidate, spec: FieldSpec, value: string) => {
    facts.set(spec.predicate, {
      id: factId(subjectId, spec.predicate, c.origin),
      subjectId,
      predicate: spec.predicate,
      object: { kind: "literal", value, datatype: spec.datatype },
      confidence: c.confidence,
      provenance: provenanceOf(c),
    });
  };

  for (const c of candidatesFor(input)) {
    const spec = FIELD_KEY_MAP[c.key];
    if (!spec) {
      diagnostics.push({ fieldKey: c.key, reason: "Unmapped field" });
      continue;
    }
    if (c.value.trim() === "") {
      diagnostics.push({ fieldKey: c.key, reason: "Empty value" });
      continue;
    }
    switch (spec.parse) {
      case "money": {
        const parsed = parsePaise(c.value);
        if (!parsed) {
          diagnostics.push({ fieldKey: c.key, reason: "Invalid amount" });
          break;
        }
        put(c, spec, parsed.paise);
        if (parsed.rupee) rupeeAmounts.set(c.key, c);
        break;
      }
      case "date":
        if (!isCalendarDate(c.value)) {
          diagnostics.push({ fieldKey: c.key, reason: "Invalid date" });
          break;
        }
        put(c, spec, c.value);
        break;
      case "string":
        put(c, spec, c.value);
        break;
    }
  }

  if (!facts.has("doc:hasCurrency")) {
    const implied = MONEY_KEYS.map((k) => rupeeAmounts.get(k)).find((c) => c !== undefined);
    const currency = FIELD_KEY_MAP.currency;
    if (implied && currency) put(implied, currency, "INR");
  }

  const ordered = [...facts.values()].sort(
    (a, b) => PREDICATES.indexOf(a.predicate) - PREDICATES.indexOf(b.predicate),
  );
  return { facts: ordered, diagnostics };
}

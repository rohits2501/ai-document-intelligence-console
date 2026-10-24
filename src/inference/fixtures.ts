import type { ExtractedField } from "@/jobs/types";
import { InferenceResult, type SyntheticPreset } from "./types";
import baselineMock from "./expected/baseline_mock.json";
import validHighValueInvoice from "./expected/valid_high_value_invoice.json";
import contradictoryDatesAndMath from "./expected/contradictory_dates_and_math.json";
import missingMandatoryEvidence from "./expected/missing_mandatory_evidence.json";

/**
 * Synthetic invoice inputs (spec 0008) beside their committed expected results. Each fixture
 * carries its own fixed job and document ids so a live run of the same input matches its expected
 * result aside from `durationMs`. The expected files are the oracle: do not regenerate them to make
 * a rule change pass. Safe to import on the client: no server modules here.
 */

export type FixtureName = "baseline_mock" | SyntheticPreset;

export interface FixtureInput {
  jobId: string;
  documentId: string;
  fields: ExtractedField[];
}

function fixtureIds(name: FixtureName) {
  return { jobId: `fixture-job-${name}`, documentId: `fixture-doc-${name}` };
}

function synthetic(entries: [key: string, value: string][]): ExtractedField[] {
  return entries.map(([key, value]) => ({
    key,
    value,
    confidence: 0.96,
    page: 1,
    bbox: null,
    source: "fixture",
  }));
}

function box(x: number, y: number, w: number, h: number) {
  return { x, y, w, h };
}

/** The six mock provider fields, page 1, exactly as the default extractor streams them. */
export const BASELINE_FIELDS: ExtractedField[] = [
  {
    key: "document_type",
    value: "Invoice",
    confidence: 0.98,
    page: 1,
    bbox: box(0.08, 0.06, 0.3, 0.04),
    source: "p1",
  },
  {
    key: "invoice_number",
    value: "INV-2026-0417",
    confidence: 0.95,
    page: 1,
    bbox: box(0.62, 0.08, 0.28, 0.04),
    source: "p1",
  },
  {
    key: "invoice_date",
    value: "2026-09-14",
    confidence: 0.92,
    page: 1,
    bbox: box(0.62, 0.14, 0.24, 0.04),
    source: "p1",
  },
  {
    key: "vendor_name",
    value: "Northwind Logistics Pvt Ltd",
    confidence: 0.89,
    page: 1,
    bbox: box(0.08, 0.2, 0.44, 0.05),
    source: "p1",
  },
  {
    key: "total_amount",
    value: "₹1,24,500.00",
    confidence: 0.74,
    page: 1,
    bbox: box(0.62, 0.82, 0.28, 0.05),
    source: "p1",
  },
  {
    key: "gstin",
    value: "29ABCDE1234F1Z5",
    confidence: 0.63,
    page: 1,
    bbox: box(0.08, 0.86, 0.34, 0.04),
    source: "p1",
  },
];

export const FIXTURE_INPUTS: Record<FixtureName, FixtureInput> = {
  baseline_mock: { ...fixtureIds("baseline_mock"), fields: BASELINE_FIELDS },
  valid_high_value_invoice: {
    ...fixtureIds("valid_high_value_invoice"),
    fields: synthetic([
      ["document_type", "Invoice"],
      ["invoice_number", "INV-2026-1001"],
      ["invoice_date", "2026-09-14"],
      ["due_date", "2026-10-14"],
      ["vendor_name", "High Value Supplies Pvt Ltd"],
      ["gstin", "29ABCDE1234F1Z5"],
      ["subtotal_amount", "₹1,00,000.00"],
      ["tax_amount", "₹18,000.00"],
      ["total_amount", "₹1,18,000.00"],
    ]),
  },
  contradictory_dates_and_math: {
    ...fixtureIds("contradictory_dates_and_math"),
    fields: synthetic([
      ["document_type", "Invoice"],
      ["invoice_number", "INV-2026-0901"],
      ["invoice_date", "2026-09-14"],
      ["due_date", "2026-09-01"],
      ["vendor_name", "Contoso Trading Pvt Ltd"],
      ["gstin", "29ABCDE1234F1Z5"],
      ["subtotal_amount", "₹1,00,000.00"],
      ["tax_amount", "₹18,000.00"],
      ["total_amount", "₹1,50,000.00"],
    ]),
  },
  missing_mandatory_evidence: {
    ...fixtureIds("missing_mandatory_evidence"),
    fields: synthetic([
      ["document_type", "Invoice"],
      ["invoice_number", "INV-2026-0418"],
      ["vendor_name", "Missing Evidence Traders Pvt Ltd"],
      ["total_amount", "₹50,000.00"],
    ]),
  },
};

/** The TypeScript engine's first run on each fixture, `durationMs` stored as `0`. */
export const EXPECTED_RESULTS: Record<FixtureName, InferenceResult> = {
  baseline_mock: InferenceResult.parse(baselineMock),
  valid_high_value_invoice: InferenceResult.parse(validHighValueInvoice),
  contradictory_dates_and_math: InferenceResult.parse(contradictoryDatesAndMath),
  missing_mandatory_evidence: InferenceResult.parse(missingMandatoryEvidence),
};

/** True when the reduced live fields are exactly the six baseline key and value pairs. */
export function matchesBaseline(fields: readonly Pick<ExtractedField, "key" | "value">[]): boolean {
  if (fields.length !== BASELINE_FIELDS.length) return false;
  const live = new Map(fields.map((f) => [f.key, f.value]));
  return BASELINE_FIELDS.every((f) => live.get(f.key) === f.value);
}

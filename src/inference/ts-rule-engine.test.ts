import { describe, expect, it } from "vitest";
import type { ExtractedField } from "@/jobs/types";
import { FIXTURE_INPUTS } from "./fixtures";
import { normalizeFacts } from "./normalize-facts";
import { evaluateRules } from "./ts-rule-engine";

function field(key: string, value: string, confidence = 0.96): ExtractedField {
  return { key, value, confidence, page: 1, bbox: null, source: "p1" };
}

function checked(fields: ExtractedField[], approvals: Record<string, boolean> = {}) {
  const { facts } = normalizeFacts({
    documentId: "doc-1",
    jobId: "job-1",
    fields,
  });
  return evaluateRules({
    documentId: "doc-1",
    facts,
    approvals: new Map(Object.entries(approvals)),
  });
}

describe("evaluateRules", () => {
  it("does not store an absent required field as false (AC-5)", () => {
    const { facts } = normalizeFacts({
      documentId: "doc-1",
      jobId: "job-1",
      fields: [
        field("invoice_number", "INV-1"),
        field("vendor_name", "Acme"),
        field("total_amount", "₹100.00"),
      ],
    });
    const output = evaluateRules({ documentId: "doc-1", facts, approvals: new Map() });
    const dateFindings = output.findings.filter((f) =>
      f.premises.some((p) => p.fieldKey === "invoice_date"),
    );

    expect(facts.some((f) => f.predicate === "doc:hasInvoiceDate")).toBe(false);
    expect(facts.some((f) => f.object.value === "false")).toBe(false);
    expect(dateFindings.map((f) => f.kind).sort()).toEqual(["missing_evidence", "shacl_violation"]);
    expect(dateFindings.every((f) => f.title === "Missing required field")).toBe(true);
    expect(dateFindings.every((f) => f.premises[0]?.value === null)).toBe(true);
  });

  it("warns that GSTIN is missing and derives no state fact (AC-11, AC-13)", () => {
    const output = checked([
      field("invoice_number", "INV-1"),
      field("invoice_date", "2026-09-14"),
      field("vendor_name", "Acme"),
      field("total_amount", "₹50,000.00"),
    ]);
    const gstinWarning = output.findings.find((f) => f.title === "GSTIN is missing");
    expect(gstinWarning?.severity).toBe("warning");
    expect(gstinWarning?.explanation).toBe("GSTIN is missing, so no state can be derived.");
    expect(output.inferredFacts.some((f) => f.predicate === "doc:hasVendorGstin")).toBe(false);
    expect(output.inferredFacts.some((f) => f.predicate === "doc:hasVendorStateCode")).toBe(false);
    expect(
      output.inferredFacts.find((f) => f.predicate === "doc:hasApprovalTier")?.object.value,
    ).toBe("standard_signoff");
  });

  it("reports delta 3200000 paise and still derives the tier and the state (AC-10)", () => {
    const fixture = FIXTURE_INPUTS.contradictory_dates_and_math;
    const { facts } = normalizeFacts({ ...fixture, review: null });
    const output = evaluateRules({
      documentId: fixture.documentId,
      facts,
      approvals: new Map(),
    });
    const dateError = output.findings.find(
      (f) => f.title === "Due date is before the invoice date",
    );
    const totalError = output.findings.find((f) => f.title === "Total does not reconcile");

    expect(dateError?.severity).toBe("error");
    expect(dateError?.explanation).toContain("2026-09-01");
    expect(dateError?.explanation).toContain("2026-09-14");
    expect(totalError?.explanation).toContain("Delta 3200000 paise");
    expect(
      output.inferredFacts.find((f) => f.predicate === "doc:hasApprovalTier")?.object.value,
    ).toBe("senior_signoff");
    expect(
      output.inferredFacts.find((f) => f.predicate === "doc:hasVendorStateCode")?.object.value,
    ).toBe("IN-KA (Karnataka)");
  });

  it("warns on an unknown GST prefix and rejects a GSTIN that fails the pattern (AC-13)", () => {
    const unknown = checked([
      field("invoice_number", "INV-1"),
      field("invoice_date", "2026-09-14"),
      field("vendor_name", "Acme"),
      field("total_amount", "₹100.00"),
      field("gstin", "27ABCDE1234F1Z5"),
    ]);
    expect(unknown.findings.find((f) => f.title === "State code is unknown")?.severity).toBe(
      "warning",
    );
    expect(unknown.inferredFacts.some((f) => f.predicate === "doc:hasVendorStateCode")).toBe(false);

    const invalid = checked([
      field("invoice_number", "INV-1"),
      field("invoice_date", "2026-09-14"),
      field("vendor_name", "Acme"),
      field("total_amount", "₹100.00"),
      field("gstin", "NOTAGSTIN"),
    ]);
    expect(invalid.findings.find((f) => f.title === "GSTIN format is not valid")?.severity).toBe(
      "error",
    );
    expect(invalid.inferredFacts.some((f) => f.predicate === "doc:hasVendorStateCode")).toBe(false);
  });

  it("skips the low confidence warning after the review approves that key (AC-12)", () => {
    const fields = FIXTURE_INPUTS.baseline_mock.fields;
    const open = checked(fields);
    const approved = checked(fields, { total_amount: true, gstin: true });

    expect(open.findings.filter((f) => f.title === "Low confidence premise")).toHaveLength(2);
    expect(open.inferredFacts.find((f) => f.predicate === "doc:hasApprovalTier")?.confidence).toBe(
      0.74,
    );
    expect(
      open.inferredFacts.find((f) => f.predicate === "doc:hasVendorStateCode")?.confidence,
    ).toBe(0.63);
    expect(approved.findings.some((f) => f.title === "Low confidence premise")).toBe(false);
    expect(approved.inferredFacts.map((f) => f.predicate).sort()).toEqual([
      "doc:hasApprovalTier",
      "doc:hasVendorStateCode",
    ]);
  });
});

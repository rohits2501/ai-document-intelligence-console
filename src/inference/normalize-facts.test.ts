import { describe, expect, it } from "vitest";
import type { ExtractedField } from "@/jobs/types";
import { normalizeFacts, parsePaise } from "./normalize-facts";

function field(key: string, value: string, confidence = 0.9): ExtractedField {
  return {
    key,
    value,
    confidence,
    page: 1,
    bbox: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
    source: "p1",
  };
}

const ids = { documentId: "doc-1", jobId: "job-1" };

describe("normalizeFacts", () => {
  it("turns ₹1,24,500.00 into 12450000 paise and currency INR (AC-4)", () => {
    const { facts, diagnostics } = normalizeFacts({
      ...ids,
      fields: [field("total_amount", "₹1,24,500.00", 0.74)],
    });

    const total = facts.find((f) => f.predicate === "doc:hasTotalAmountPaise");
    const currency = facts.find((f) => f.predicate === "doc:hasCurrency");
    expect(diagnostics).toEqual([]);
    expect(total?.object).toEqual({ kind: "literal", value: "12450000", datatype: "xsd:integer" });
    expect(currency?.object).toEqual({ kind: "literal", value: "INR", datatype: "xsd:string" });
    expect(parsePaise("₹1,24,500.00")).toEqual({ paise: "12450000", rupee: true });
  });

  it("emits no fact for a bad date, a bad amount, or an unknown key (AC-4)", () => {
    const { facts, diagnostics } = normalizeFacts({
      ...ids,
      fields: [
        field("invoice_date", "14/09/2026"),
        field("total_amount", "₹-5.00"),
        field("tax_amount", "₹1.234"),
        field("mystery_box", "should not be stored"),
      ],
    });

    expect(facts).toEqual([]);
    expect(diagnostics).toEqual([
      { fieldKey: "invoice_date", reason: "Invalid date" },
      { fieldKey: "total_amount", reason: "Invalid amount" },
      { fieldKey: "tax_amount", reason: "Invalid amount" },
      { fieldKey: "mystery_box", reason: "Unmapped field" },
    ]);
    const dumped = JSON.stringify(diagnostics);
    expect(dumped).not.toContain("14/09/2026");
    expect(dumped).not.toContain("₹");
    expect(dumped).not.toContain("should not be stored");
  });

  it("keeps a present currency field instead of implying INR (AC-4)", () => {
    const { facts } = normalizeFacts({
      ...ids,
      fields: [field("total_amount", "₹10.00"), field("currency", "USD")],
    });
    expect(facts.find((f) => f.predicate === "doc:hasCurrency")?.object.value).toBe("USD");
  });

  it("marks a saved review as reviewed and keeps the extracted page, box, and source (AC-3)", () => {
    const extracted = field("total_amount", "₹1.00", 0.74);
    const { facts } = normalizeFacts({
      ...ids,
      fields: [extracted],
      review: { fields: [{ key: "total_amount", value: "₹2.00", approved: true }] },
    });
    const total = facts.find((f) => f.predicate === "doc:hasTotalAmountPaise");
    expect(total?.object.value).toBe("200");
    expect(total?.provenance.origin).toBe("reviewed");
    expect(total?.confidence).toBe(0.74);
    expect(total?.provenance.page).toBe(1);
    expect(total?.provenance.bbox).toEqual(extracted.bbox);
    expect(total?.provenance.source).toBe("p1");
    expect(total?.provenance.documentId).toBe("doc-1");
    expect(total?.provenance.jobId).toBe("job-1");
  });

  it("gives a review only field confidence 1 and a null page, box, and source (AC-3)", () => {
    const { facts } = normalizeFacts({
      ...ids,
      fields: [],
      review: { fields: [{ key: "due_date", value: "2026-10-01", approved: true }] },
    });
    expect(facts).toHaveLength(1);
    const due = facts[0];
    expect(due?.predicate).toBe("doc:hasDueDate");
    expect(due?.confidence).toBe(1);
    expect(due?.provenance.origin).toBe("reviewed");
    expect(due?.provenance.page).toBeNull();
    expect(due?.provenance.bbox).toBeNull();
    expect(due?.provenance.source).toBeNull();
  });

  it("drops a cleared review instead of keeping the extracted value (AC-5)", () => {
    const { facts, diagnostics } = normalizeFacts({
      ...ids,
      fields: [field("vendor_name", "Northwind Logistics Pvt Ltd")],
      review: { fields: [{ key: "vendor_name", value: "  ", approved: true }] },
    });
    expect(facts.some((f) => f.predicate === "doc:hasVendorName")).toBe(false);
    expect(facts.some((f) => f.object.value === "false")).toBe(false);
    expect(diagnostics).toEqual([]);
  });
});

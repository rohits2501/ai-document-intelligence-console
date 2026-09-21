import { describe, it, expect } from "vitest";
import { groupLabelForKey, groupReviewFields } from "./field-groups";
import type { ExtractedField } from "./types";

function field(key: string, over: Partial<ExtractedField> = {}): ExtractedField {
  return { key, value: key, confidence: 0.9, page: 1, bbox: null, source: "p1", ...over };
}

describe("groupLabelForKey", () => {
  it("maps known mock keys to curated labels", () => {
    expect(groupLabelForKey("document_type")).toBe("Document");
    expect(groupLabelForKey("invoice_number")).toBe("Invoice");
    expect(groupLabelForKey("invoice_date")).toBe("Invoice");
    expect(groupLabelForKey("vendor_name")).toBe("Vendor");
    expect(groupLabelForKey("gstin")).toBe("Vendor");
    expect(groupLabelForKey("total_amount")).toBe("Totals");
  });

  it("falls back to the title-cased first token for unknown keys", () => {
    expect(groupLabelForKey("buyer_gstin")).toBe("Buyer");
    expect(groupLabelForKey("shipping_address")).toBe("Shipping");
    expect(groupLabelForKey("name")).toBe("Name");
  });
});

describe("groupReviewFields", () => {
  it("preserves first-seen group order and arrival order within a group", () => {
    const groups = groupReviewFields([
      field("document_type"),
      field("invoice_number"),
      field("vendor_name"),
      field("invoice_date"),
      field("total_amount"),
      field("gstin"),
    ]);

    expect(groups.map((g) => g.label)).toEqual(["Document", "Invoice", "Vendor", "Totals"]);
    const invoice = groups.find((g) => g.label === "Invoice");
    expect(invoice?.fields.map((f) => f.key)).toEqual(["invoice_number", "invoice_date"]);
  });

  it("returns a group even when it holds a single field", () => {
    const groups = groupReviewFields([field("document_type")]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBe("Document");
    expect(groups[0]?.fields).toHaveLength(1);
  });

  it("groups unknown keys by their prefix in stream order", () => {
    const groups = groupReviewFields([
      field("buyer_name"),
      field("seller_name"),
      field("buyer_gstin"),
    ]);
    expect(groups.map((g) => g.label)).toEqual(["Buyer", "Seller"]);
    expect(groups[0]?.fields.map((f) => f.key)).toEqual(["buyer_name", "buyer_gstin"]);
  });
});

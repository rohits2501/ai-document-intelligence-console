import { describe, it, expect } from "vitest";
import { mapAnnotations } from "./docai-provider";

describe("mapAnnotations (document AI results → ExtractedField[])", () => {
  it("maps flat leaves with confidence, page, and object bbox from the first source", () => {
    const result = { invoice_number: "INV-1", total: "100" };
    const annotations = {
      invoice_number: {
        confidence: 0.95,
        sources: [{ page: 1, bbox: { x: 0.1, y: 0.2, w: 0.3, h: 0.05 } }],
      },
      total: { confidence: 0.6, sources: [{ page: 2 }] },
    };
    const fields = mapAnnotations(result, annotations);
    expect(fields).toHaveLength(2);

    const inv = fields.find((f) => f.key === "invoice_number");
    expect(inv?.value).toBe("INV-1");
    expect(inv?.confidence).toBe(0.95);
    expect(inv?.page).toBe(1);
    expect(inv?.bbox).toEqual({ x: 0.1, y: 0.2, w: 0.3, h: 0.05 });
    expect(inv?.source).toBe("p1");

    const total = fields.find((f) => f.key === "total");
    expect(total?.confidence).toBe(0.6);
    expect(total?.bbox).toBeNull();
  });

  it("normalizes an array bbox [x0,y0,x1,y1] to {x,y,w,h}", () => {
    const fields = mapAnnotations(
      { field: "v" },
      { field: { confidence: 0.8, sources: [{ page: 1, bbox: [0.2, 0.3, 0.6, 0.5] }] } },
    );
    const bbox = fields[0]?.bbox;
    expect(bbox?.x).toBeCloseTo(0.2);
    expect(bbox?.y).toBeCloseTo(0.3);
    expect(bbox?.w).toBeCloseTo(0.4);
    expect(bbox?.h).toBeCloseTo(0.2);
  });

  it("defaults confidence to 1 when annotations are missing, and skips nested objects", () => {
    const fields = mapAnnotations({ a: "x", nested: { b: 1 } }, {});
    expect(fields).toHaveLength(1);
    expect(fields[0]?.key).toBe("a");
    expect(fields[0]?.confidence).toBe(1);
  });
});

import { describe, expect, it } from "vitest";
import {
  GST_STATE_BY_PREFIX,
  LOW_CONFIDENCE_CUTOFF,
  ONTOLOGY_VERSION,
  SENIOR_SIGNOFF_MIN_PAISE,
} from "./ontology";

describe("invoice ontology constants", () => {
  it("keeps the phase 1 version, threshold, cutoff, and state row (AC-9, AC-12, AC-15)", () => {
    expect(ONTOLOGY_VERSION).toBe("invoice-v1");
    expect(SENIOR_SIGNOFF_MIN_PAISE).toBe(10000000n);
    expect(LOW_CONFIDENCE_CUTOFF).toBe(0.75);
    expect(GST_STATE_BY_PREFIX["29"]).toBe("IN-KA (Karnataka)");
    expect(Object.keys(GST_STATE_BY_PREFIX)).toEqual(["29"]);
  });
});

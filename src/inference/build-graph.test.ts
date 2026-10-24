import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildDataTurtle, inputHash, subjectIri } from "./build-graph";
import { EXPECTED_RESULTS, FIXTURE_INPUTS } from "./fixtures";
import { normalizeFacts } from "./normalize-facts";
import { ONTOLOGY_VERSION } from "./ontology";

describe("buildDataTurtle", () => {
  it("escapes a quote and a newline and encodes the subject (AC-15)", () => {
    const documentId = "doc id/1";
    const { facts } = normalizeFacts({
      documentId,
      jobId: "job-1",
      fields: [],
      review: { fields: [{ key: "vendor_name", value: 'Say "hi"\nnext', approved: true }] },
    });
    const turtle = buildDataTurtle(documentId, facts);

    expect(subjectIri(documentId)).toBe(
      `<http://example.invalid/id/${encodeURIComponent(documentId)}>`,
    );
    expect(turtle).toContain(subjectIri(documentId));
    expect(turtle).toContain(String.raw`Say \"hi\"\nnext`);
    expect(turtle).not.toContain('Say "hi"');
  });
});

describe("inputHash", () => {
  it("matches the committed hash for the same canonical facts and invoice-v1 (AC-15)", () => {
    for (const name of Object.keys(FIXTURE_INPUTS) as (keyof typeof FIXTURE_INPUTS)[]) {
      const fixture = FIXTURE_INPUTS[name];
      const { facts } = normalizeFacts({ ...fixture, review: null });
      const expected = EXPECTED_RESULTS[name].certificate.inputHash;
      const shuffled = [...facts].reverse();

      const sorted = [...facts].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      const digest = createHash("sha256")
        .update(`${ONTOLOGY_VERSION}\n${JSON.stringify(sorted)}`, "utf8")
        .digest("hex");

      expect(inputHash(facts)).toBe(expected);
      expect(inputHash(shuffled)).toBe(expected);
      expect(digest).toBe(expected);
      expect(ONTOLOGY_VERSION).toBe("invoice-v1");
    }
  });
});

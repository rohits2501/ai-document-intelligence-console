import { createHash } from "node:crypto";
import { ONTOLOGY_VERSION, PREFIXES_TURTLE, SUBJECT_NAMESPACE } from "./ontology";
import type { CanonicalFact, FactObject } from "./types";

/**
 * Deterministic Turtle and the input hash (spec 0008). Document strings are untrusted: every
 * literal is escaped before it enters the graph.
 */

export function subjectIri(documentId: string): string {
  return `<${SUBJECT_NAMESPACE}${encodeURIComponent(documentId)}>`;
}

export function escapeLiteral(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
}

function objectTurtle(object: FactObject): string {
  if (object.kind === "entity") {
    return `<${SUBJECT_NAMESPACE}${encodeURIComponent(object.value)}>`;
  }
  const literal = `"${escapeLiteral(object.value)}"`;
  // Only a plain `xsd:` name is safe to splice; anything else (e.g. from CLI stdout) stays untyped.
  return /^xsd:[A-Za-z]+$/.test(object.datatype) ? `${literal}^^${object.datatype}` : literal;
}

function subjectBlock(documentId: string, facts: readonly CanonicalFact[]): string {
  if (facts.length === 0) return "";
  const lines = facts.map((f) => `    ${f.predicate} ${objectTurtle(f.object)}`);
  return `${subjectIri(documentId)}\n${lines.join(" ;\n")} .\n`;
}

/** The data graph an engine receives: prefixes plus the canonical facts. */
export function buildDataTurtle(documentId: string, facts: readonly CanonicalFact[]): string {
  const block = subjectBlock(documentId, facts);
  return block ? `${PREFIXES_TURTLE}\n${block}` : PREFIXES_TURTLE;
}

/** The result graph: the data graph with the inferred triples appended after the engine returns. */
export function buildResultTurtle(
  documentId: string,
  facts: readonly CanonicalFact[],
  inferred: readonly CanonicalFact[],
): string {
  const data = buildDataTurtle(documentId, facts);
  const block = subjectBlock(documentId, inferred);
  return block ? `${data}\n# Inferred by the ${ONTOLOGY_VERSION} rules\n${block}` : data;
}

function canonicalFact(fact: CanonicalFact): Record<string, unknown> {
  const p = fact.provenance;
  return {
    id: fact.id,
    subjectId: fact.subjectId,
    predicate: fact.predicate,
    object:
      fact.object.kind === "entity"
        ? { kind: fact.object.kind, value: fact.object.value }
        : { kind: fact.object.kind, value: fact.object.value, datatype: fact.object.datatype },
    confidence: fact.confidence,
    provenance: {
      documentId: p.documentId,
      jobId: p.jobId,
      fieldKey: p.fieldKey,
      page: p.page,
      bbox: p.bbox ? { x: p.bbox.x, y: p.bbox.y, w: p.bbox.w, h: p.bbox.h } : null,
      source: p.source,
      origin: p.origin,
      ...(p.ruleId !== undefined ? { ruleId: p.ruleId } : {}),
    },
  };
}

/** Lowercase hex SHA-256 of `invoice-v1`, a newline, then canonical JSON of the facts by id. */
export function inputHash(facts: readonly CanonicalFact[]): string {
  const sorted = [...facts].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const json = JSON.stringify(sorted.map(canonicalFact));
  return createHash("sha256").update(`${ONTOLOGY_VERSION}\n${json}`, "utf8").digest("hex");
}

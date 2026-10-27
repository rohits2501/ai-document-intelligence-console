# 0009. Document knowledge layers

**Date**: 2026-10-27
**Status**: Proposed
**Mode**: ARCHITECTURE

_Decision history: [rationale.md](rationale.md)._

## Summary

You keep the console and the invoice rules, and you do not add a memory engine or a giant model in this pass. Reading a page, connecting documents, and proving that facts satisfy named rules are three different jobs. A later perception harness may read the page. A later knowledge tree may help a person find the right pages across documents. Neither is built now, and neither replaces the rules you already have.

## Decision

**Chosen option**: Option 1: Keep four layers and build nothing new now

Four layers. Two exist. Two are recorded for later and are not built.

- The console answers where the evidence is, who reviewed it, and what was decided. This is already built. The mock extractor stays the default. Spec 0004 and `ExtractionProvider` stay as they are.
- The invoice rules answer whether the facts satisfy the named checks. This is already built in `src/inference/`. Spec 0008 still forbids a language model inside that lab. Today the check is one document. A later question such as "find every invoice that fails this rule" reuses this vocabulary. It does not justify a second graph product.
- A future perception harness answers what is on the page. It is not built now. When someone builds it, it sits behind `ExtractionProvider` and keeps page, box, and confidence on every field.
- A future knowledge tree answers where to read across documents: an index, section page ranges, tables kept as data, and a citation back to the page. It is not built now. Do not stop at the tree. Navigation without the rules costs more and still misses records. Do not ship a knowledge base that only searches passages and cites them.

Cognee is not a replacement for the invoice rules. Do not add Cognee, LightRAG, Graphiti, Microsoft GraphRAG, or LlamaIndex in this pass. If a later slice needs a cross document question, write that question against the invoice vocabulary first. Benchmark Cognee against LightRAG only if that vocabulary cannot express the question. Consider Graphiti only if a fact must be reconstructed as of a date.

The model shortlist in the rationale is a note for that later experiment. It is not a dependency now.

## What a later build must preserve

- Page, box, and confidence stay on every extracted field. A field with no source is not a finished field.
- The invoice vocabulary stays the rule check. A corpus question reuses it. A new graph product has to wait until that vocabulary cannot express the question.
- A knowledge tree, if it is ever built, ships together with a query over that vocabulary. A tree alone, or a search box that only cites passages, is not the product.
- A person reviews an ontology change. The change is versioned. The committed invoice fixtures run before the change counts.
- A frontier model is a last resort for a page the harness cannot ground. It is not the reader for every page.
- Uncertain extractions stay in the review list. Silence stays unknown. The check does not prove the scan, the document, or a payment.

## This pass

There is no build plan. This spec records a decision for later work. It does not authorize a slice, a dependency, a new environment variable, or a code change.

## Consequences

**Positive**:

- A later build does not have to guess whether Cognee, a frontier model, or a citation search box replaces the invoice rules.
- The console, the mock extractor, and the inference lab stay the path a visitor can run.

**Negative / tradeoffs**:

- Cross document questions stay unanswered until a later slice. This pass does not add that slice.
- The page harness and the knowledge tree are named and not built, so the demo still extracts with the mock unless `EXTRACTION_PROVIDER` is `docai`.

**Neutral**:

- No scope row is added. Spec 0004 is not edited. Spec 0008 keeps its ban on a language model inside the lab.
- No new code area. No new flag.

## Follow-up

- [ ] A later slice may build the perception harness behind `ExtractionProvider`, using the model shortlist in the rationale only as a benchmark list.
- [ ] A later slice may add a knowledge tree only together with a query over the invoice vocabulary. Do not ship the tree alone.
- [ ] Benchmark Cognee against LightRAG only after a cross document question cannot be written in the invoice vocabulary.
- [ ] Consider Graphiti only if a fact must be reconstructed as of a date.

## Rationale

The reasoning, the options, and the source notes are in [rationale.md](rationale.md).

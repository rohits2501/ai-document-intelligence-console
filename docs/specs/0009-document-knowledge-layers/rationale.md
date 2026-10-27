# 0009 rationale · Document knowledge layers

## Context

The console already ingests a document, proposes fields, shows the evidence on the page, and lets a person review and approve. The inference lab already turns those fields into facts and checks them against the invoice rules. A missing fact stays unknown. Spec 0008 keeps a language model out of that lab. Spec 0004 keeps a real extractor optional, and the mock stays the default so a visitor needs no key.

The open question is what to add next. A memory engine, a frontier model on every page, and a search box that cites passages all look like they could replace work you already have. They do not. Reading a page, connecting facts across documents, and proving that facts satisfy named rules are three different jobs. Leaving that unwritten means a later build has to guess, and the likely guess is to swap the invoice rules for a graph product or to send every page to a large model.

The demo still has to run with no extra install. Idle cost stays near zero. Any later model is a benchmark, not a new requirement for opening the job console.

## Options considered

### Option 1: Keep four layers and build nothing new now

Leave the console and the invoice rules in place. Record a perception harness and a knowledge tree as later layers. Build neither in this pass. A later harness sits behind `ExtractionProvider` and keeps page, box, and confidence. A later tree ships only together with a query over the same invoice vocabulary.

**Pros**:

- The visitor path does not change.
- The rule check stays repeatable and separate from retrieval.
- A later slice has a written order: vocabulary first, tree with the vocabulary, a memory engine only if the vocabulary cannot say the question.

**Cons**:

- Cross document questions stay out of the product until a later slice.
- The harness and the tree are named before any of that code exists.

### Option 2: Replace the invoice rules with Cognee

Use Cognee as the knowledge graph, the retrieval layer, and the ontology. Its repository describes ontology grounded graph construction, including an annotate mode, a strict mode that drops unmatched entities, and fuzzy name matching. Treat that as the validation pipeline.

**Pros**:

- One open source project already ingests text, builds a graph, and can ground entities to an ontology file.
- You would write less graph code yourself.

**Cons**:

- Strict mode prunes the graph. The original text can still come back in retrieval. That is not a proof that every retrieved passage satisfies the invoice rules.
- The lab's findings, the page and box on each fact, and the human approval bit are the console's job. Cognee does not replace them.
- Adopting it now would put a Python service beside a TypeScript console before a cross document question exists.

### Option 3: Send every page to a frontier model

Skip a small document parser. Send each page to a large general model and ask it for the fields, the layout, and the conclusion.

**Pros**:

- One model call is a small amount of integration code.
- A large model can sometimes read a messy page that a specialist misses.

**Cons**:

- You pay a frontier price on pages a small parser can read.
- A fluent answer can be wrong, and markdown alone does not keep the box you need to highlight the source.
- The invoice rules would be checking prose instead of typed facts.

### Option 4: Ship a search and cite knowledge base now

Add a knowledge base that uploads documents and lets an agent search and cite passages. Or add several graph frameworks at once (Cognee, LightRAG, Graphiti, Microsoft GraphRAG, LlamaIndex) and pick a winner in production.

**Pros**:

- A citation search box is easy to explain.
- Each framework has a real specialty: dual level retrieval, facts that change over time, corpus summaries, or a modular graph index.

**Cons**:

- Passage search cannot tell you that you found every matching record. A knowledge base that only searches and cites describes only this surface.
- Several frameworks at once splits the work before one question is chosen.
- None of them is the invoice rule check.

## Rationale

Option 1 is the one that matches the forces in Context. The console already answers where the evidence is and who decided. The invoice rules already answer whether the facts satisfy the named checks. Those two stay. A harness is the right shape for reading pages, because the frontier products below all split layout, extraction, and grounding, and because a large model is the expensive last step rather than the reader. A knowledge tree is the right shape for a later cross document question, and only together with the vocabulary you already have, because a tree without that query is the expensive incomplete option in published runs of that pattern.

Cognee stays a benchmark candidate, not the core. The accuracy and cost change in those runs comes from a tree plus a queryable ontology, not from a memory engine. Shared agent memory is a later step, which is the slot Cognee would fill, and that step is not this fabric. LightRAG is the other retrieval benchmark if the invoice vocabulary cannot express the question. Graphiti waits until a fact must be reconstructed as of a date.

## Frontier document products

These products do not send every page to one model. Each one splits the work.

One published document harness puts a semantic layout parser and a reading order network in front of a vision language model. The model can read a whole page, and the harness is still used because the accuracy trade off is worse without it. Public weights for that vision model are not offered as a file to drop in. PaddleOCR-VL 1.6 reports 96.33 on OmniDocBench v1.6 on its own model card. Classic OCR APIs score far lower on structural tables that also score tables and formulas, because they do not emit those the same way. That gap is not evidence that those APIs fail at invoices.

Google Document AI keeps three processors. Form Parser returns generic fields, tables, and checkboxes, and it cannot be trained further. Layout Parser turns a file into structure and chunks. The newer layout versions call a Gemini model for that layout step, not as the whole product. Custom Extractor takes a schema you define. Google's own guidance is to start with the foundation model and to fine tune only after labeled examples exist.

Azure Document Intelligence will not fine tune Layout. Layout reads structure. A custom neural model extracts the fields you label. A classifier routes document types, and composed models send each type to the right extractor.

Amazon Textract returns words, forms, tables, signatures, and boxes. Amazon's own guidance puts a language model after that, for classification, normalization, and values the page never states. Adapters tune queries. The language model is not the OCR engine.

LandingAI Agentic Document Extraction is the closest product shape to this console. Parse returns reading order markdown, a block tree, and a normalized box on each block. Extract fills a schema from that markdown. Ground joins each field back to the page and the box. They warn that markdown alone cannot highlight the source, and that parsing the file again invalidates the old ranges.

## Knowledge tree and ontology

A published knowledge fabric is a second architecture. It is for questions across a corpus. It does not replace the page harness. Documents are compiled once into two layers.

The first layer is a knowledge tree, and it needs no domain model. A document parser reads each file. A long document becomes a folder with a one page index: title, summary, and each section with its page range. An agent lists folders, reads the index, opens a page range, and inspects a table. A citation points at the passage, the image, or the table row. On their own runs, navigation beat flat hybrid search. The gain was largest when the answer needed several documents or a table. The tree did not solve completeness. On one Harvey LAB request the tree found 7 of 14 qualifying offerings and added 3 false positives. Exploring the tree also cost more than plain retrieval: 3.79 million tokens and 59.2 tool calls per task, against 1.80 million tokens and 36.5 calls for agentic retrieval.

The second layer is a domain ontology. Types, properties, and links are compiled ahead of time, then filtered and joined like a database. On that same request the ontology returned 14 of 14 qualifying offerings and added no false positives. Across Harvey LAB, with GLM 5.3 as the agent model, they report rubric criteria met rising from 55.1 percent (agentic retrieval) to 74.4 percent (tree) to 84.2 percent (ontology plus tree). The last setup used 0.86 million tokens, 14.2 tool calls, and 0.28 dollars per task. They also report that this beat a published Harvey harness figure of 79.1 percent for one frontier model and 71.7 percent for another. On Sierra tau-knowledge, with GLM 5.2, they report the same accuracy as the baseline with 64 percent fewer tokens. These figures are that vendor's own report, not an independent audit.

People stay in the loop. Agents may draft the types, the glossary, and the value lists. A person reviews them. Uncertain extractions and proposed fixes go to review. Changes are versioned, and the domain's evaluation set runs before an update goes live. A live database stays queried at the source, so access control does not move into the fabric. They say the fabric can run in a small air gapped setup on smaller models. Shared agent memory is the step they name next. It is not something this fabric already is.

A hosted knowledge base is the thin product surface of that idea. You upload policies, contracts, and similar files, and a connected agent searches and cites them. That surface does not describe a tree, an ontology, or a rule check. That is the passage search that cannot tell an agent whether it found everything.

For this console, the invoice rules are the ontology layer, scoped to one document today. The committed fixture results are the evaluation set a later rule change must pass. The knowledge tree is the layer to record for later, not to build now.

## Model shortlist

This list is for a later benchmark. Nothing here is a dependency of the current console.

Try PaddleOCR-VL 1.6 first for parsing tables, layout, and reading order. Compare dots.ocr as a second parser. Keep Qwen2.5-VL-3B only if the parser misses a visual relationship on the page. LightOnOCR is the lightweight baseline if the first two are too heavy to run locally. Send a page to a frontier model only when the harness cannot ground the field.

Preserve page numbers and boxes through parsing. If a model returns markdown, do not treat that markdown as enough to highlight the source in the viewer. The invoice rules validate typed facts, not the model's prose.

## References

**Project sources**:

- Spec 0004, the optional document AI provider, and `src/extraction/`
- Spec 0008, the invoice inference lab, and `src/inference/`
- The committed expected results under `src/inference/expected/`

**Practices & standards**:

- Split reading a page, connecting documents, and proving named rules into separate layers.
- Compile structure once, then query it, instead of retrieving passages again for every question.
- A person reviews an uncertain field and a rule change, and the evaluation set runs before the change counts.

**Links**:

Chat sources:

- Cognee company page: https://www.linkedin.com/company/cognee-ai/
- Cognee repository: https://github.com/topoteretes/cognee
- Cognee ontology grounding: https://docs.cognee.ai/core-concepts/further-concepts/ontologies
- Cognee cognify and ontology mode: https://docs.cognee.ai/python-api/cognify
- Cognee ontology settings: https://github.com/topoteretes/cognee/blob/main/.env.template
- Cognee remote ontology bug: https://github.com/topoteretes/cognee/issues/6221
- LightRAG repository: https://github.com/HKUDS/LightRAG
- Graphiti repository: https://github.com/getzep/graphiti
- Graphiti overview: https://help.getzep.com/graphiti/getting-started/overview
- Microsoft GraphRAG repository: https://github.com/microsoft/graphrag
- LlamaIndex repository: https://github.com/run-llama/llama_index
- LlamaIndex graph example: https://developers.llamaindex.ai/python/examples/cookbooks/graphrag_v2/
- PaddleOCR-VL 1.6 model card: https://huggingface.co/PaddlePaddle/PaddleOCR-VL-1.6
- dots.ocr repository: https://github.com/rednote-hilab/dots.ocr
- LightOnOCR-2-1B model card: https://huggingface.co/lightonai/LightOnOCR-2-1B
- Qwen2.5-VL-3B-Instruct model card: https://huggingface.co/Qwen/Qwen2.5-VL-3B-Instruct
- Harvey LAB firm knowledge: https://www.harvey.ai/blog/legal-agent-bench-law-firm-knowledge
- Harvey LAB tasks: https://github.com/harveyai/harvey-labs/tree/main/tasks/firm-knowledge
- Sierra tau knowledge: https://sierra.ai/blog/tau-knowledge

Plan sources, the frontier product notes:

- Google Document AI extraction overview: https://docs.cloud.google.com/document-ai/docs/extracting-overview
- Google Document AI layout parser: https://docs.cloud.google.com/document-ai/docs/layout-parse-chunk
- Google Document AI form parser: https://docs.cloud.google.com/document-ai/docs/form-parser
- Azure Document Intelligence layout: https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/prebuilt/layout?view=doc-intel-4.0.0
- Azure Document Intelligence custom neural: https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/train/custom-neural?view=doc-intel-4.0.0
- Azure Document Intelligence composed models: https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/train/composed-models?view=doc-intel-4.0.0
- Amazon Textract with a language model after extraction: https://aws.amazon.com/blogs/machine-learning/intelligent-document-processing-with-amazon-textract-amazon-bedrock-and-langchain/
- LandingAI parse, extract, and ground: https://docs.landing.ai/dpt3/overview
- LandingAI grounding: https://docs.landing.ai/dpt3/ground

# 0008. Document inference lab

**Date**: 2026-10-24
**Status**: Proposed
**Mode**: FEATURE
**Feature**: Document inference lab (scope #18)

## Summary

You get a document inference lab on the job console. It turns extracted fields, plus any review edits you saved, into facts linked to their source, checks those facts, and shows the conclusions that follow. A missing fact stays unknown, and the check does not prove the scan, the document, or a payment. The default checker is plain TypeScript so a visitor can run it with no extra binary.

## Context

An operator can already drop a document, watch a job, and edit the extracted fields. Those fields are candidates. Nothing in the console checks whether they can stand together, or what follows from them. A due date can come before the invoice date. A total can disagree with its parts. A required field can be missing.

The demo has to keep working for a visitor with no extra software, including a later deploy of the Next.js app to Vercel Hobby. That host cannot hold a native binary, a long running process, or the local SQLite file. Idle cost has to stay near zero, because the page should remain up when nobody is running a check. Inferred conclusions have to stay locked by tests, which is why this feature is Beta.

If this stays undecided, a build would have to guess. It might write conclusions into the job event log, treat a missing field as a false value, or describe a passed check as proof that a claim should be paid. It might also pick a host, a binary, or a language model on its own.

## Requirements

**User stories**:

- As an operator, I want extracted fields and my saved review edits turned into facts I can trace to the page, so that I can see what the check used.
- As an operator, I want those facts checked, and the violated rules and derived conclusions shown apart from the extracted fields, so that I can see what follows and what is missing.
- As an operator, I want a missing fact to stay unknown, so that silence is not treated as a denial.
- As an operator, I want the synthetic invoice cases, including a saved example when a live run is slow or unavailable, so that I can still see a conclusion, the supporting facts, and the violated rules.
- As a visitor on the hosted demo, I want the lab to run with no Rust binary, so that the page still works.
- As an operator on my own machine, I want to point the lab at the local checker, so that I can run the same result shape through that binary.

**Acceptance criteria**:

- **AC-1**: `POST /api/inference/preview` with a known `jobId` reads that job, replays its events, and reads any saved review. It returns `200` with an `InferenceResult`. After the call, the job, the event log, and the review are unchanged. An unknown `jobId` returns `404`. A body that fails validation returns `400`.
- **AC-2**: The preview route is not part of the SSE job stream. It appends no `JobEvent`. `ExtractionProvider`, `JobEvent`, and `ExtractedField` stay as they are.
- **AC-3**: On the live job path, a `ReviewedField` value for a key replaces the extracted value, and that fact's `origin` is `reviewed`. Page, box, and source stay with the extracted field when one exists. An untouched key keeps `origin` `extracted`. Provenance carries `documentId`, `jobId`, `fieldKey`, `page`, `bbox`, and `source`.
- **AC-4**: The parse rule turns `₹1,24,500.00` into the integer `12450000` (`xsd:integer` paise) and emits `doc:hasCurrency` `INR` because the amount uses `₹`. A date that is not `YYYY-MM-DD`, or an amount that is not a zero or greater decimal with at most two fraction digits, emits no fact for that predicate and records a diagnostic.
- **AC-5**: An absent required field is not stored as `false`. It produces a `missing_evidence` finding and, for a required invoice predicate, a `shacl_violation`. Unknown stays unknown.
- **AC-6**: Unset `INFERENCE_BACKEND`, or `ts`, selects `DeterministicTsInferenceEngine` (`engineUsed` `ts-symbolic-engine`). Vercel, CI, and a visitor with no Rust binary use this engine. A value other than `ts`, `cli`, or `http` (after trim and lower case) returns the not configured error.
- **AC-7**: `INFERENCE_BACKEND=cli` runs `open-ontologies` through `execFile`, with an argument array, an `AbortSignal`, a `5000` ms timeout, and a new directory per run under the data dir. It does not use a shell. A missing binary, a crash, a timeout, an abort, or stdout that is not the result JSON is an error response and is not an `InferenceResult`. A fake executable that exits `0` and prints the result JSON is returned as a result. The test suite does not need the real binary.
- **AC-8**: `INFERENCE_BACKEND=http` returns a not configured error in this phase. The route does not call the network and does not read `INFERENCE_SERVICE_URL` to make a request.
- **AC-9**: On `valid_high_value_invoice`, the result includes `doc:hasApprovalTier` `senior_signoff` and `doc:hasVendorStateCode` `IN-KA (Karnataka)`, each linked to its premise. There is no error finding. The certificate status is `verified`.
- **AC-10**: On `contradictory_dates_and_math`, due date `2026-09-01` before invoice date `2026-09-14` produces a `contradiction` for `RULE-DATE-ORDER` citing both fields. Subtotal plus tax unequal to the total produces a `contradiction` for `RULE-TOTAL-RECONCILIATION` whose explanation includes the signed delta `3200000` paise.
- **AC-11**: On `missing_mandatory_evidence`, absent `invoice_date` produces a `shacl_violation` and a `missing_evidence` finding. Absent `gstin` produces a `missing_evidence` finding and no GSTIN fact, no false GSTIN, and no state fact.
- **AC-12**: A premise with confidence below `0.75` that the review has not approved produces a `missing_evidence` warning for `RULE-PROVENANCE-CONFIDENCE`, naming the derived conclusion that depends on it. The derived fact is still present. An approved review of that same key does not produce that warning.
- **AC-13**: `SHACL-INV-REQUIRED` requires `doc:hasInvoiceNumber`, `doc:hasInvoiceDate`, `doc:hasVendorName`, and `doc:hasTotalAmountPaise`. When `doc:hasVendorGstin` is present, `SHACL-GSTIN-FORMAT` requires the 15 character pattern in the rule table.
- **AC-14**: The four fixtures `baseline_mock`, `valid_high_value_invoice`, `contradictory_dates_and_math`, and `missing_mandatory_evidence` each have a committed expected result. When a live preview is slow, cold, or unavailable, the panel can show that saved conclusion, the supporting facts, and the violated rules, with the label `Saved example, not a live check`.
- **AC-15**: A live result includes `canonicalFacts`, `inferredFacts`, `findings`, a Turtle graph with escaped literals, and a certificate with `engineUsed`, ontology version `invoice-v1`, a SHA-256 `inputHash` over the canonical facts plus that version, and `durationMs`. `verified` means the check finished with no error finding. `rejected` means at least one error finding. The panel copy for those statuses is `Checked` and `Checked, rules failed`. The check does not prove OCR, document authenticity, or that a claim should be paid. Aside from `durationMs`, the same facts and rules return the same facts, findings, hash, and engine id.
- **AC-16**: `InferencePanel` loads through `next/dynamic` only when `flags.inferenceLab` is on. The flag is `NEXT_PUBLIC_FEATURE_INFERENCE_LAB`, default `true`, using the existing `bool` helper. The job page stays inside `perf/budgets.json`. New styles use existing color tokens only. Severity is a dot plus text. Choosing a premise selects that field key for the document viewer and the review list.
- **AC-17**: The preview route runs inside `span()` with `request_id`, `job_id`, and `document_id`.
- **AC-18**: The preview body accepts `jobId` and an optional `scenarioPreset` of `live_job` (the default), `valid_high_value_invoice`, `contradictory_dates_and_math`, or `missing_mandatory_evidence`. A synthetic preset uses the fixture fields and does not write them onto the job or the review.

## Options considered

### Option 1: TypeScript by default, a local binary when you ask, HTTP later

One `InferenceEngine` interface. The default implementation is a TypeScript checker with no added dependency. A local `open-ontologies` binary is a second implementation, used only when config asks for it. An HTTP implementation is named now and returns a clear not configured error until a later host exists.

**Pros**:

- The hosted demo and CI run with no binary.
- A later host can return the same result type.
- Idle cost stays near zero.

**Cons**:

- The invoice rules exist twice, in TypeScript and in the ontology the binary runs.
- The binary path works only on a machine that has it.

### Option 2: A native binary on every host

Every environment, including the hosted demo and CI, runs the Rust binary.

**Pros**:

- One checker implements the rules.

**Cons**:

- Vercel Hobby cannot hold that binary, a long running process, or the local SQLite file.
- A visitor or a CI run with no Rust install cannot open the lab.

### Option 3: A Cloud Run service in this phase

The preview route POSTs the same input to Google Cloud Run and parses the same result type. Minimum instances stay at `0`.

**Pros**:

- The heavy checker stays off the web app.
- Scale to zero removes idle compute cost.

**Cons**:

- This phase would need a deploy, a public URL, and a quota design before the lab can be shown.
- Scale to zero does not cap a burst of requests, and a cold start makes the demo wait.

### Option 4: A live language model

A model reads the fields and writes the conclusion.

**Pros**:

- The wording can be flexible.

**Cons**:

- The conclusion is not a repeatable check of named rules.
- A missing fact can be filled in.
- The demo would depend on a model key and a per call cost.

## Decision

**Chosen option**: Option 1: TypeScript by default, a local binary when you ask, HTTP later

The lab gets one `InferenceEngine` interface in `src/inference/`. `DeterministicTsInferenceEngine` is the default. `OpenOntologiesCliEngine` is local only. The HTTP backend is named and, in this phase, returns a not configured error.

This phase does not add TanStack AI, a live language model, a second ontology, or a Cloud Run deploy.

## Rationale

The console is a portfolio demo that already runs on a mock extractor and a local job store. The lab has to sit beside that, on a machine with no extra install, and still be the thing a later Vercel Hobby deploy can serve. A TypeScript checker meets that force. The binary stays an opt in for a local machine, because putting it on Vercel would break the host constraint in Context.

The result type is fixed now so a later Cloud Run adapter can return the same object without a rewrite of the panel. Shipping that host in this phase would spend the demo on a deploy, a cold start, and a burst that scale to zero does not cap. A language model would fight the other force in Context: a missing fact must stay unknown, and a conclusion must be locked by tests.

Extraction keeps proposing candidate fields. The event log stays the source of truth for the job. Inference reads that log and the saved review, then stops.

## Feature design

**Data model sketch**:

New module `src/inference/`. No new table. Nothing here is written to SQLite. The job, the event log, and the review stay the records they already are.

`FactProvenance`: `documentId`, `jobId`, `fieldKey`, `page` (number or null), `bbox` (the existing `BBox` or null), `source` (string or null), `origin` (`extracted`, `reviewed`, or `inferred`), and `ruleId` (present only when `origin` is `inferred`).

`CanonicalFact`:

```ts
export const CanonicalFact = z.object({
  id: z.string(),
  subjectId: z.string(),
  predicate: z.enum([
    "doc:hasDocumentType",
    "doc:hasInvoiceNumber",
    "doc:hasInvoiceDate",
    "doc:hasDueDate",
    "doc:hasVendorName",
    "doc:hasTotalAmountPaise",
    "doc:hasSubtotalPaise",
    "doc:hasTaxAmountPaise",
    "doc:hasCurrency",
    "doc:hasVendorGstin",
    "doc:hasVendorStateCode",
    "doc:hasApprovalTier",
    "doc:hasComplianceStatus",
  ]),
  object: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("entity"), value: z.string() }),
    z.object({ kind: z.literal("literal"), value: z.string(), datatype: z.string() }),
  ]),
  confidence: z.number().min(0).max(1),
  provenance: FactProvenance,
});
```

Phase 1 emits `kind: "literal"` only. `doc:hasComplianceStatus` is on the enum so the schema stays stable. No rule produces it.

`subjectId` is `doc:` plus `Job.documentId`. Fact id is `fact:` plus `subjectId`, the predicate, and the origin, joined by `:`. An inferred fact id appends `:` plus the rule id. One fact per predicate. A review replacement removes the extracted fact for that predicate.

`InferencePremise`: `factId` (string or null), `fieldKey`, `label`, `value` (string or null), `page` (number or null), `source` (string or null).

`InferenceFinding`: `id`, `kind` (`shacl_violation`, `contradiction`, `missing_evidence`, `inferred_conclusion`), `severity` (`error`, `warning`, `info`), `ruleId`, `title`, `explanation`, `premises`, and optional `conclusion` (`{ predicate, value }`). Finding id is `finding:` plus the kind, the rule id, and the sorted premise field keys joined by `+`. For `RULE-PROVENANCE-CONFIDENCE`, the id also appends `:` plus the derived predicate. A missing required field therefore has two ids, one for `shacl_violation` and one for `missing_evidence`.

`CertificateStatus`: `status` (`verified`, `rejected`, or `not_checked`), `engineUsed` (`ts-symbolic-engine` or `open-ontologies-cli`), `ontologyVersion`, `inputHash`, `durationMs`. No Phase 1 path sets `not_checked`.

`InferenceResult`: `jobId`, `documentId`, `canonicalFacts`, `inferredFacts`, `findings`, `turtleGraph`, `certificate`.

`InferenceEngineError`: `code` (`not_configured`, `binary_missing`, `timeout`, `crashed`, `bad_output`, `aborted`), `message`.

Field key map (the only predicates Phase 1 can build from a field):

| Field key | Predicate | Datatype | Label |
|---|---|---|---|
| `document_type` | `doc:hasDocumentType` | `xsd:string` | Document type |
| `invoice_number` | `doc:hasInvoiceNumber` | `xsd:string` | Invoice number |
| `invoice_date` | `doc:hasInvoiceDate` | `xsd:date` | Invoice date |
| `due_date` | `doc:hasDueDate` | `xsd:date` | Due date |
| `vendor_name` | `doc:hasVendorName` | `xsd:string` | Vendor name |
| `total_amount` | `doc:hasTotalAmountPaise` | `xsd:integer` | Total |
| `subtotal_amount` | `doc:hasSubtotalPaise` | `xsd:integer` | Subtotal |
| `tax_amount` | `doc:hasTaxAmountPaise` | `xsd:integer` | Tax |
| `currency` | `doc:hasCurrency` | `xsd:string` | Currency |
| `gstin` | `doc:hasVendorGstin` | `xsd:string` | GSTIN |

A key outside this map produces no fact. It produces a diagnostic `Unmapped field` and nothing else.

Parse rules:

- Money keys (`total_amount`, `subtotal_amount`, `tax_amount`): strip `₹`, spaces, and commas. What remains must be a decimal with at most two fraction digits, and zero or greater. Paise is that number times `100`, as an integer string. `₹1,24,500.00` is `12450000`. A leading minus, a third fraction digit, or any other symbol produces no money fact and a diagnostic.
- If any parsed amount contained `₹`, also emit one `doc:hasCurrency` literal `INR`. No other symbol maps to a currency. A `currency` field, when present and non empty, wins over that implied `INR`.
- Dates: the whole string must be `YYYY-MM-DD`. Compare those strings as calendar dates. There is no time zone. Any other string produces no date fact and a diagnostic.
- GSTIN: a non empty string is stored as the literal. The format rule judges it. An empty string produces no GSTIN fact.

Review rule, live job only:

- Replay events with `jobReducer` in `src/jobs/job-state.ts` (`eventLog.since(jobId, 0)`). That reducer is the source of the extracted fields, including later `partial_result` keys and the reset on `queued`.
- `runtime.reviews.get(jobId)` is the saved review. A `ReviewedField` with a non blank value replaces the extracted value for that key. Origin is `reviewed`. Confidence stays the extracted confidence when an extracted field exists. When the review is the only source, confidence is `1`. Page, bbox, and source come from the extracted field, or null when extraction never produced that key.
- A blank or whitespace review value removes the fact. The fact is absent.
- Synthetic presets do not apply the job review.

Rules. Each id is the string in this table. Severity: `shacl_violation` and `contradiction` are `error`. `missing_evidence` is `warning`. `inferred_conclusion` is `info`.

| Rule id | What it checks | Finding |
|---|---|---|
| `SHACL-INV-REQUIRED` | The invoice subject needs `doc:hasInvoiceNumber`, `doc:hasInvoiceDate`, `doc:hasVendorName`, and `doc:hasTotalAmountPaise` (`sh:minCount 1` on each). | One `shacl_violation` and one `missing_evidence` per absent required predicate. Title `Missing required field`. Explanation `Required field {label} is missing.` |
| `SHACL-GSTIN-FORMAT` | A present `doc:hasVendorGstin` matches `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$`. | One `shacl_violation` when the fact exists and fails the pattern. Title `GSTIN format is not valid`. Explanation `GSTIN {value} does not match the 15 character pattern.` An absent GSTIN does not fail this rule. |
| `RULE-DATE-ORDER` | Both date facts exist and the due date is strictly before the invoice date. | One `contradiction`. Premises are both fields. Title `Due date is before the invoice date`. Explanation `Due date {due} is before invoice date {invoice}.` Equal dates produce no finding. |
| `RULE-TOTAL-RECONCILIATION` | Subtotal, tax, and total facts all exist, and `subtotal + tax !== total`, in paise. | One `contradiction`. Explanation `Subtotal plus tax does not equal the total. Delta {delta} paise.` Delta is `total - (subtotal + tax)`, signed. A missing part does not become `0`. |
| `RULE-DERIVE-APPROVAL-TIER` | `doc:hasTotalAmountPaise` exists. | Inferred literal `doc:hasApprovalTier`: `senior_signoff` when paise is `>= 10000000` (`₹1,00,000.00`), otherwise `standard_signoff`. Premise is the total fact. Confidence is that premise's confidence. Title `Derived conclusion`. Explanation `Total {amount} gives review tier {tier}.` |
| `RULE-DERIVE-GST-STATE` | `doc:hasVendorGstin` exists, matches the format pattern, and the first two characters are `29`. | Inferred literal `doc:hasVendorStateCode` `IN-KA (Karnataka)`. Premise is the GSTIN fact. Confidence is that premise's confidence. Explanation `GSTIN prefix 29 gives state IN-KA (Karnataka).` Any other prefix that passes the pattern produces `missing_evidence` (`State code is unknown for this GSTIN prefix.`) and no state fact. A failed pattern produces no state fact. |
| `RULE-PROVENANCE-CONFIDENCE` | A premise of an inferred fact has confidence `< 0.75`, and the live review field for that key is missing or `approved` is false. | One `missing_evidence` warning per such premise. The inferred fact stays. Explanation `{label} has confidence {confidence} and is not approved. {derived label} depends on it.` Synthetic presets have no review, so this rule sees them as not approved. |

The tier vocabulary is `senior_signoff` and `standard_signoff`. There is no value `senior_reviewer_required`.

Each inferred fact also has one `inferred_conclusion` finding with `conclusion: { predicate, value }`. The panel's derived section reads `inferredFacts`. The validation section reads findings whose kind is `shacl_violation`, `contradiction`, or `missing_evidence`.

Fixtures. Inputs live in `src/inference/fixtures.ts` beside the committed expected results. `baseline_mock` copies the six `SAMPLE_FIELDS` in `src/extraction/mock-provider.ts` with `page` `1`: document type `Invoice` at `0.98`, invoice number `INV-2026-0417` at `0.95`, invoice date `2026-09-14` at `0.92`, vendor `Northwind Logistics Pvt Ltd` at `0.89`, total `₹1,24,500.00` at `0.74`, GSTIN `29ABCDE1234F1Z5` at `0.63`, with those fields' boxes and source `p1`. Expected live outcome with no review: the six facts, currency `INR`, inferred `senior_signoff` (confidence `0.74`) and `IN-KA (Karnataka)` (confidence `0.63`), two low confidence warnings, no error finding, certificate `verified`.

`valid_high_value_invoice` (every confidence `0.96`, page `1`, bbox null, source `fixture`): document type `Invoice`, invoice number `INV-2026-1001`, invoice date `2026-09-14`, due date `2026-10-14`, vendor `High Value Supplies Pvt Ltd`, GSTIN `29ABCDE1234F1Z5`, subtotal `₹1,00,000.00`, tax `₹18,000.00`, total `₹1,18,000.00`. Sum is exact (`10000000 + 1800000 = 11800000`). Tier is `senior_signoff`. State is `IN-KA (Karnataka)`. No error finding. Certificate `verified`.

`contradictory_dates_and_math` (confidence `0.96`, page `1`, bbox null, source `fixture`): document type `Invoice`, invoice number `INV-2026-0901`, invoice date `2026-09-14`, due date `2026-09-01`, vendor `Contoso Trading Pvt Ltd`, GSTIN `29ABCDE1234F1Z5`, subtotal `₹1,00,000.00`, tax `₹18,000.00`, total `₹1,50,000.00`. Delta is `3200000` paise. Both contradictions are present. The tier and the state are still derived. Certificate `rejected`.

`missing_mandatory_evidence` (confidence `0.96`, page `1`, bbox null, source `fixture`): document type `Invoice`, invoice number `INV-2026-0418`, vendor `Missing Evidence Traders Pvt Ltd`, total `₹50,000.00` (`5000000` paise). No invoice date, GSTIN, due date, subtotal, or tax. Required field findings for the invoice date. Missing evidence for the invoice date and the GSTIN. Tier `standard_signoff`. No state fact. Certificate `rejected`.

Committed expected results store the TypeScript engine's facts, findings, turtle, and certificate for those four inputs. `durationMs` in the file is `0`. A later live run must match the file aside from `durationMs`. The first implementation run is what gets committed. After that, the file is the oracle.

Ontology. `src/inference/ontology.ts` exports `ONTOLOGY_VERSION` `invoice-v1`, the SHACL shapes, and the rule text as Turtle strings. Demo namespace `http://example.invalid/doc#`. This is one synthetic invoice ontology. There is no second domain.

Graph. `src/inference/build-graph.ts` writes deterministic Turtle. Subject IRI is `http://example.invalid/id/` plus `encodeURIComponent(documentId)`. Predicates use the `doc:` prefix. Literals are double quoted. `\`, `"`, newline, and carriage return are escaped. The data graph sent to an engine contains the canonical facts. The `turtleGraph` on the result appends the inferred triples after the engine returns. `inputHash` is the lowercase hex SHA-256 of the UTF-8 string `invoice-v1`, a newline, then canonical JSON of the canonical facts only (sorted by `id`, keys in the order `id`, `subjectId`, `predicate`, `object`, `confidence`, `provenance`; object keys `kind`, `value`, `datatype`; provenance keys `documentId`, `jobId`, `fieldKey`, `page`, `bbox`, `source`, `origin`, `ruleId`; bbox keys `x`, `y`, `w`, `h`; omit `datatype` on an entity and omit `ruleId` when absent). The hash does not cover inferred facts, the turtle, or `durationMs`.

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/api/inference/preview` | POST | `jobId` string, required. `scenarioPreset` optional enum: `live_job`, `valid_high_value_invoice`, `contradictory_dates_and_math`, `missing_mandatory_evidence`. Default `live_job`. | `InferenceResult` | none (same local demo as the rest of the console) | `400` invalid body. `404` unknown job. `501` not configured or binary missing. `502` timeout, crash, abort, or bad output. |

Error body: `{ error, message }`. Messages: `Inference HTTP backend is not configured in this phase.` (`not_configured` for `http` and for an unknown backend name), `The open-ontologies binary was not found.` (`binary_missing`), `The inference engine timed out.`, `The inference engine crashed.`, `The inference engine returned output that is not a result.`, `The inference engine was aborted.`, `Job not found.`

The route reads `runtime.jobs.get`, `runtime.eventLog.since(jobId, 0)`, and `runtime.reviews.get`. It never calls `append`, `put`, or a job status change. It is not an SSE route.

Engine return shape from both backends: `{ inferredFacts, findings }` JSON. The route builds the `InferenceResult`. It sets `engineUsed`, `ontologyVersion`, `inputHash`, and `durationMs` from the route's own measurement. A CLI stdout that includes those certificate fields does not override them. `durationMs` is `Date.now()` around `infer()`.

**Engine selector**:

`selectEngine` in `src/inference/engine.ts` reads `INFERENCE_BACKEND`.

- `ts`: `DeterministicTsInferenceEngine` in `src/inference/ts-rule-engine.ts`. It evaluates the rule table in code. It does not spawn a process and does not create a temp directory.
- `cli`: `OpenOntologiesCliEngine` in `src/inference/open-ontologies-adapter.ts`. Binary is `OPEN_ONTOLOGIES_BIN` when that value is non empty after trim, otherwise the argv0 `open-ontologies` so `execFile` searches `PATH`. Args are `["--data", dataPath, "--shapes", shapesPath]`. Options are `{ signal, timeout: 5000, cwd: runDir }`. No `exec`, no shell string. `runDir` is `resolveDataDir()` plus `inference-runs` plus `crypto.randomUUID()`. The adapter writes `data.ttl` and `shapes.ttl`, and deletes the directory in a `finally` block, including on failure. Exit `0` and JSON `{ inferredFacts, findings }` that parses against the zod schemas is a result. Any other exit, a timeout, an abort, `ENOENT`, or unparseable stdout is `InferenceEngineError`. Partial stdout from a crash is not a result.
- `http`: no request. `InferenceEngineError` code `not_configured`.

**Hosting boundary**:

Build on the Mac. The Next.js demo may later deploy to Vercel Hobby. On that host the selector stays on `ts`. Do not put the Rust binary, a long running process, or the local SQLite file on Vercel. `resolveDataDir()` already uses `/tmp` when `VERCEL` is set. The TypeScript engine does not need that directory. If `cli` is set on Vercel and the binary is absent, the response is `binary_missing`.

Cloud Run is not a Phase 1 task. It is specified under Follow-up.

**Panel**:

`InferencePanel` sits in the job console. It requests a preview when it mounts and when the scenario changes. While the request is in flight, the panel shows `Checking facts`. The dynamic import's loading state shows `Loading inference lab`. Selector labels are `Live job fields (with review edits)`, `Valid high value invoice`, `Contradictory dates and math`, and `Missing mandatory evidence`. Sections are `Validation and contradictions`, `Derived conclusions`, and a `details` element titled `Graph and check details` (engine, input hash, live duration, turtle). On the saved example path the panel shows the banner and does not present the file's `durationMs` of `0` as this request's timing. When the flag is off, `JobConsole` does not render the panel and does not call the dynamic import.

**Value sourcing**:

| Action | Value produced or displayed | Source |
|---|---|---|
| Normalize a live field | predicate, datatype, label | Field key map in this spec |
| Normalize a live field | literal value | Extracted field `value`, after the parse rule for that key |
| Normalize a live field | confidence | Extracted field `confidence`, or `1` when a review is the only source |
| Normalize a live field | `documentId`, `jobId` | Job record `documentId` and `id` |
| Normalize a live field | `fieldKey`, `page`, `bbox`, `source` | Extracted field. Null page, bbox, and source when the review is the only source |
| Normalize a live field | `origin` `extracted` | No review field for that key |
| Apply a review edit | literal value and `origin` `reviewed` | Review override: `ReviewedField.value` for that key |
| Apply a review edit | page, bbox, source, confidence | Extracted field when it exists. Confidence `1` and null page, bbox, and source when it does not |
| Drop a cleared review | no fact | Review override: blank `ReviewedField.value`. Absence, not `false` |
| Ignore an unknown key | no fact | Field key map. Diagnostic only |
| Parse money | paise integer | Parse rule on the amount string |
| Parse a rupee amount | `doc:hasCurrency` `INR` | Parse rule. A present `currency` field wins |
| Parse a date | `xsd:date` | Parse rule. `YYYY-MM-DD` only |
| Store a GSTIN | raw literal | Extracted field or review override. SHACL shape judges the pattern |
| Required field missing | `shacl_violation` and `missing_evidence` | SHACL shape `SHACL-INV-REQUIRED` |
| GSTIN pattern fail | `shacl_violation`, no state fact | SHACL shape `SHACL-GSTIN-FORMAT` |
| Date order | `contradiction`, both premises | Forward chained rule `RULE-DATE-ORDER` |
| Total math | `contradiction`, signed paise delta | Forward chained rule `RULE-TOTAL-RECONCILIATION` |
| Approval tier | `senior_signoff` or `standard_signoff` | Forward chained rule `RULE-DERIVE-APPROVAL-TIER`. Threshold `10000000` paise is the constant in that rule |
| GST state | `IN-KA (Karnataka)` | Forward chained rule `RULE-DERIVE-GST-STATE`. The prefix table in that rule has one row, `29` |
| Unknown GST prefix | `missing_evidence`, no state fact | Forward chained rule `RULE-DERIVE-GST-STATE` |
| Low confidence warning | warning text and premise | Forward chained rule `RULE-PROVENANCE-CONFIDENCE`. Cutoff `0.75`. Approval bit from `ReviewedField.approved` |
| Inferred confidence | number on the inferred fact | Minimum confidence among that rule's premises |
| Fact id and finding id | stable strings | Id rules in the data model sketch |
| Turtle subject | IRI | Spec constant namespace plus `encodeURIComponent(documentId)` |
| Turtle literals | escaped strings | Graph builder escape rule |
| `inputHash` | hex SHA-256 | Canonical JSON of canonical facts plus `invoice-v1` |
| `ontologyVersion` | `invoice-v1` | Spec constant in `ontology.ts` |
| `engineUsed` | `ts-symbolic-engine` or `open-ontologies-cli` | The engine the selector ran |
| `durationMs` | integer | Clock around `infer()` |
| `certificate.status` | `verified` or `rejected` | `rejected` when any finding severity is `error`, otherwise `verified` |
| Preview `request_id` | id | `newRequestId()` in `src/telemetry` |
| Preview `job_id`, `document_id` | ids | Job record |
| Synthetic field list | the fixture values in this spec | Fixture constant. The job review is not applied |
| Committed fallback facts | findings, inferred facts, turtle | Committed expected result for that fixture |
| Panel banner | `Saved example, not a live check` | Spec constant. Shown only on the fallback path |
| Panel status copy | `Checked`, `Checked, rules failed` | Spec constant. JSON status stays `verified` or `rejected` |
| Tier copy | `Senior signoff`, `Standard signoff`, and `Derived review tier from the total. This is not a decision to pay.` | Spec constant |
| State copy | `Derived from the GSTIN prefix. This is not a tax filing.` | Spec constant |
| Severity badge | text `Error`, `Warning`, or `Info`, plus a dot | Spec constant. Color is `var(--danger)`, `var(--warning)`, or `var(--info)` |
| Panel chrome | surface and border | Existing tokens `var(--bg-subtle)` and `var(--border)`. `Checked` uses `var(--success)`. No new color token |
| Panel headings | the three section titles, the four selector labels, `Checking facts`, `Loading inference lab` | Spec constants in the Panel section |
| Shown confidence | the number on that fact, when the panel shows one | The fact's `confidence`. The panel may omit it |
| Premise click | selected field key | The premise `fieldKey`, passed through the key `JobConsole` already shares with the viewer and the review list |
| Fallback wait | `8000` ms | Spec constant. After that, or on a network failure, `501`, or `502`, the panel uses the committed result when the rule below says so |
| Live job fallback | `baseline_mock` expected result | Only when the reduced extracted values equal the six baseline values and the saved review is absent. Any other live failure shows the error and no invented conclusion |
| Synthetic fallback | that preset's expected result | The selected preset |
| Successful live response | the response body | The preview route. A success is never replaced by the saved file |
| CLI timeout | `5000` ms | Spec constant `CLI_TIMEOUT_MS` |
| CLI binary | path | `OPEN_ONTOLOGIES_BIN`, or argv0 `open-ontologies` |
| HTTP result | none | Spec constant error. `INFERENCE_SERVICE_URL` is not a request target in this phase |

**Key invariants**:

- The preview leaves the job, the event log, and the review unchanged.
- A missing fact stays unknown. The engine does not store `false` for it.
- `verified` means the supplied facts passed the invoice rules with no error finding. The panel must not say the document is authentic, that OCR is proven, or that a claim should be paid.
- A CLI crash, timeout, abort, missing binary, or bad stdout is an error. It is never an `InferenceResult`.
- `http` performs no network I/O in this phase.
- `ExtractionProvider`, `JobEvent`, and `ExtractedField` stay unchanged. Inference code lives in `src/inference/` and does not add a job event type.
- The same canonical facts and `invoice-v1` always produce the same `inputHash`.
- Phase 1 adds no language model and no second ontology.
- New CSS uses existing tokens only. The job page stays within `perf/budgets.json` (`/jobs/[id]` ceiling `137216` gzipped bytes). Raise `maxBytes` in the same change only if a measured first load exceeds that ceiling. The panel is a dynamic import, same pattern as `DocumentViewer` (`next/dynamic`, `ssr: false`), so it stays out of the first load graph.

**Security model**:

There is no account system. The preview route is as open as the rest of this local demo. It reads one job the operator already stored. It does not write the job, the event log, or the review.

Document strings are untrusted. They are escaped before they enter Turtle. The CLI receives them only as files in the per run directory, never as a shell string. Error messages do not echo the document text, the turtle, or the temp path.

The local binary is trusted software on that machine. `INFERENCE_SERVICE_URL` is not called in this phase, so a configured URL cannot receive the document yet. The Cloud Run follow up requires a timeout, a max input size, a request quota, and a budget alert before that URL is public.

**Configuration required**:

- `INFERENCE_BACKEND`: `ts`, `cli`, or `http`. Default `ts`. Selects the engine.
- `OPEN_ONTOLOGIES_BIN`: optional path for the `cli` backend. Empty means `open-ontologies` on `PATH`.
- `INFERENCE_SERVICE_URL`: reserved for the future `http` backend. Unused as a request target in this phase.
- `NEXT_PUBLIC_FEATURE_INFERENCE_LAB`: public flag `inferenceLab`. Default `true`. Gates the panel, not the preview route, so a checker can still call the route.

Document the three engine variables and the flag in `.env.example` with one line each. Do not change the meaning of the existing flags.

**Critical test scenarios**:

- Happy path: a live mock job with no review returns the `baseline_mock` facts, `senior_signoff`, `IN-KA (Karnataka)`, two low confidence warnings, no error finding, and a second call leaves events and the review unchanged. Verifies **AC-1**, **AC-3**, **AC-6**, **AC-12**, **AC-15**.
- Review override: an approved edit of `gstin` and `total_amount` supplies those values and does not emit `RULE-PROVENANCE-CONFIDENCE` for them. Verifies **AC-3**, **AC-12**.
- Money and dates: `₹1,24,500.00` becomes `12450000` paise and `INR`. A bad date and a bad amount emit no fact. Verifies **AC-4**.
- Valid fixture: tier, state, and `verified`. Verifies **AC-9**, **AC-13**.
- Contradictory fixture: both contradictions, including delta `3200000`, and the derived facts still present. Verifies **AC-10**.
- Missing fixture: no false GSTIN, no false date, required field violation, missing evidence, `standard_signoff`, no state. Verifies **AC-5**, **AC-11**.
- CLI failure: a fake executable that crashes, times out, or prints garbage yields an error and no result. A fake executable that prints valid JSON yields a result. Verifies **AC-7**.
- HTTP backend: the not configured error, and no outbound request. Verifies **AC-8**.
- Unknown backend name: not configured, not a silent `ts` result. Verifies **AC-6**.
- Panel: flag off renders no panel. Flag on loads it dynamically. Severity shows text. A premise activates the shared field key. A failed synthetic run shows the saved example banner. Verifies **AC-14**, **AC-16**.
- Span: the preview log line carries `request_id`, `job_id`, and `document_id`. Verifies **AC-17**.
- Presets: a synthetic preset does not change the stored review, and an omitted preset means `live_job`. Verifies **AC-18**.
- Trust: a vendor name containing a quote is escaped in the turtle, and the panel copy does not say the document is authentic or that a claim should be paid. Verifies **AC-15**.
- Permission: this demo has no accounts. The stand in is the read boundary. The route returns data for a stored job and writes nothing. A failed checker is an error, not a `verified` result. Verifies **AC-1**, **AC-7**.

## Build plan

Tracer Bullet. The first tasks stand up one thread: a live job field becomes a fact, the default checker returns a result, and the preview route reads the job without writing. Later tasks thicken the rules, the graph, the fixtures, the other engines, and the panel.

1. Add `src/inference/types.ts` with the schemas in this spec. Do not change `ExtractedField`, `JobEvent`, or `ExtractionProvider`. Satisfies **AC-2**.
2. Add `src/inference/normalize-facts.ts` and `POST /api/inference/preview` for `live_job`, using `jobReducer`, the saved review, and `DeterministicTsInferenceEngine` for the required field check, the tier, and the state. The route writes nothing. Satisfies **AC-1**, **AC-3**, **AC-4**, **AC-5**, **AC-6**.
3. Finish the TypeScript rule table: GSTIN format, date order, total reconciliation, low confidence, and the certificate status. Satisfies **AC-9**, **AC-10**, **AC-11**, **AC-12**, **AC-13**, **AC-15**.
4. Add `src/inference/ontology.ts` and `src/inference/build-graph.ts`: Turtle, escaping, and `inputHash`. Satisfies **AC-15**.
5. Add the four fixtures and their committed expected results in `src/inference/fixtures.ts`, and honor `scenarioPreset` on the preview route without writing. Satisfies **AC-9**, **AC-10**, **AC-11**, **AC-14**, **AC-18**.
6. Add `selectEngine`, `OpenOntologiesCliEngine` (`execFile`, abort, timeout, per run directory, error classification), and the `http` not configured branch. Satisfies **AC-6**, **AC-7**, **AC-8**.
7. Add `flags.inferenceLab`, the `.env.example` lines, and `src/components/InferencePanel.tsx` loaded from `JobConsole` with `next/dynamic`. Include the three sections, the scenario selector, premise selection, the saved example banner, token colors, and a budget check. Satisfies **AC-14**, **AC-16**.
8. Wrap the preview handler in `span("inference.preview", ...)`. Satisfies **AC-17**.

## Consequences

**Positive**:

- A visitor can run the lab with no binary, and the conclusions are the same on the next run.
- The job stream stays the source of truth. Review edits stay where they already are.
- A later host can return the same result type.

**Negative / tradeoffs**:

- The invoice rules live in TypeScript and in the Turtle the binary runs, so the two can drift. The committed expected results lock the TypeScript side. Parity with a real `open-ontologies` binary is not proved in this phase.
- `cli` does nothing useful on Vercel. A backend name outside `ts`, `cli`, and `http` fails the preview.
- The rules are a synthetic invoice. A passed check is easy to overread as a payment decision, which is why the panel copy is fixed.
- Scale to zero, when that later host exists, removes idle cost and does not cap a burst.

**Neutral**:

- New code lives in `src/inference/`, plus one panel, one route, and one flag.
- `doc:hasComplianceStatus` and certificate status `not_checked` are reserved and unused.
- Cloud Run is named and not built.

## Follow-up

- [ ] After the lab works, move only the Rust adapter to Google Cloud Run. Request based billing, minimum instances `0`, called through `INFERENCE_SERVICE_URL`, returning the same `InferenceResult` as the local engines. Before that URL is public, set a timeout, a max input size, a request quota, and a budget alert. Scale to zero removes idle compute cost. It does not cap a burst of requests. Do not deploy Cloud Run in the Phase 1 build.
- [ ] Do not choose a VPS, Fly.io, Render, Oracle Always Free, boat.dev, a paid database, or a live language model for this lab.
- [ ] Align the CLI argument list with the real `open-ontologies` binary if its flags differ from `--data` and `--shapes`.
- [ ] Add GST state rows beyond prefix `29` only when a later spec names them.
- [ ] Prove the real binary returns the same findings as the TypeScript engine. This phase only classifies adapter success and failure.
- [ ] A producer for `doc:hasComplianceStatus`, if one is ever needed, belongs in a later spec.

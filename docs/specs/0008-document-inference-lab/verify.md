# Verify: Document inference lab · spec 0008 · updated 2026-10-24

_Steps derived from spec 0008 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual

- [ ] `npm run dev`, upload a document, let the mock job finish, open `/jobs/<id>`. Expect an `Inference lab` panel below the document and review grid, a `Loading inference lab` status while its chunk loads, then `Checking facts`, then status `Checked`. → AC-16 · value source: panel headings, panel status copy
- [ ] On that job with no review saved, expect the validation section to show two `Warning` findings titled `Low confidence premise` (Total at `0.74`, GSTIN at `0.63`), and the derived section to show `Senior signoff` with `Derived review tier from the total. This is not a decision to pay.` and `IN-KA (Karnataka)` with `Derived from the GSTIN prefix. This is not a tax filing.` → AC-9, AC-12, AC-15 · value source: approval tier, GST state, low confidence warning, tier copy, state copy
- [ ] Each severity shows a dot plus the text `Error`, `Warning`, or `Info`. Inspect the dot: color is `var(--danger)`, `var(--warning)`, or `var(--info)`; the `Checked` dot is `var(--success)`; the panel surface is `var(--bg-subtle)` with `var(--border)`. Repeat in the dark theme. → AC-16 · value source: severity badge, panel chrome
- [ ] Click a premise button (for example `Total` under the low confidence warning). Expect it to show pressed, the review list to select `total_amount`, and the document viewer to highlight that field's box. → AC-16 · value source: premise click
- [ ] Open `Graph and check details`. Expect engine `ts-symbolic-engine`, ontology `invoice-v1`, a 64 character input hash, a live duration in ms, a facts table with predicate, value, origin, field, and page per fact, and the Turtle text. The panel omits confidence, which the spec allows. → AC-15 · value source: `engineUsed`, `ontologyVersion`, `inputHash`, `durationMs`, shown confidence
- [ ] Press `Check again` twice. Expect the same facts, findings, and input hash each time; only the duration may change. → AC-15 · value source: fact id and finding id
- [ ] Choose scenario `Valid high value invoice`. Expect `Checked`, no `Error` finding, `Senior signoff`, and `IN-KA (Karnataka)`. → AC-9, AC-18 · value source: synthetic field list
- [ ] Choose `Contradictory dates and math`. Expect `Checked, rules failed`, an `Error` titled `Due date is before the invoice date` citing both dates, and an `Error` titled `Total does not reconcile` whose text says `Delta 3200000 paise`. The tier and state still show. → AC-10 · value source: date order, total math
- [ ] Choose `Missing mandatory evidence`. Expect `Checked, rules failed`, an `Error` and a `Warning` for the missing invoice date, a `Warning` titled `GSTIN is missing` with `GSTIN is missing, so no state can be derived.`, `Standard signoff`, and no state conclusion. No GSTIN row and no invoice date row in the facts table. → AC-5, AC-11, AC-13 · value source: required field missing, approval tier (below threshold)
- [ ] After any synthetic preset, reload the job. Expect the review list and the timeline unchanged; the fixture values were not written onto the job. → AC-18
- [ ] Edit and approve `total_amount` and `gstin` in the review list, save, then `Check again` on `Live job`. Expect no `Low confidence premise` warning for those keys, the tier and state still present, and those facts showing `reviewed` origin in the facts table. → AC-3, AC-12 · value source: apply a review edit, low confidence approval bit
- [ ] Clear `vendor_name` in the review, save, and check again. Expect a `Missing required field` error for vendor name and no vendor name fact (absent, not `false`). → AC-5 · value source: drop a cleared review
- [ ] Change `gstin` in the review to `27ABCDE1234F1Z5`, save, check again. Expect a `Warning` titled `State code is unknown` and no state fact. Change it to `NOTAGSTIN`: expect a `GSTIN format is not valid` error and no state fact. → AC-13 · value source: unknown GST prefix, GSTIN pattern fail, store a GSTIN
- [ ] Set `INFERENCE_BACKEND=http`, restart, open a fresh mock job with no review. Expect the banner `Saved example, not a live check`, the baseline conclusion, and duration `Not measured, saved example`. → AC-8, AC-14 · value source: live job fallback, panel banner, committed fallback facts
- [ ] With `INFERENCE_BACKEND=http` still set, save any review edit on that job and check again. Expect the error message ending `No conclusion is shown.` and no saved example. → AC-14 · value source: live job fallback (review present)
- [ ] With `INFERENCE_BACKEND=http`, pick each synthetic preset. Expect that preset's saved result under the banner. → AC-14 · value source: synthetic fallback
- [ ] With the default backend, confirm the banner never appears on a successful live check, even on a slow first compile. → value source: successful live response, fallback wait
- [ ] `NEXT_PUBLIC_FEATURE_INFERENCE_LAB=false npm run dev`. Open a job. Expect no panel and, in the network tab, no request for the panel chunk and no call to `/api/inference/preview`. → AC-16
- [ ] Read all panel copy. Expect it never says the document is authentic, that OCR is proven, or that a claim should be paid. → AC-15

## Commands

- [ ] `curl -s -XPOST localhost:3000/api/inference/preview -H 'content-type: application/json' -d '{"jobId":"<id>"}'` on a mock job with no review. Expect `200`, seven canonical facts with `total_amount` `12450000` (`xsd:integer`) and currency `INR`, two inferred facts, `certificate.status` `verified`. → AC-1, AC-4, AC-6 · value source: parse money, parse a rupee amount, normalize a live field
- [ ] Before and after that call, compare `GET /api/jobs/<id>/events` and the saved review. Expect identical events and review. → AC-1, AC-2
- [ ] Same call with `{"jobId":"nope"}` → `404` `{error:"not_found"}`. With `{}` or `{"jobId":""}` → `400` `{error:"invalid_body"}`. With `"scenarioPreset":"bogus"` → `400`. → AC-1, AC-18
- [ ] In the live response, every canonical fact carries `provenance` with `documentId` and `jobId` equal to the job record, plus `fieldKey`, `page` `1`, a `bbox`, and `source`, with `origin` `extracted`. → AC-3 · value source: `documentId`/`jobId`, `fieldKey`/`page`/`bbox`/`source`, origin extracted
- [ ] Each inferred fact's confidence equals the minimum of its premises (tier `0.74`, state `0.63` on the baseline). → AC-12 · value source: inferred confidence
- [ ] For a review edit of a key with no extracted field, expect that fact's confidence `1` and null page, bbox, and source. → AC-3 · value source: apply a review edit (no extracted field), normalize confidence
- [ ] Post each synthetic preset. Expect the body to equal `src/inference/expected/<preset>.json` except `durationMs`, and job ids `fixture-job-<preset>`. → AC-9, AC-10, AC-11, AC-14, AC-18 · value source: committed fallback facts
- [ ] Omit `scenarioPreset`. Expect the same result as `"live_job"`. → AC-18
- [ ] Watch the dev server log during a preview. Expect an `inference.preview` span line with `request_id`, `job_id`, and `document_id`. → AC-17 · value source: preview `request_id`, `job_id`, `document_id`
- [ ] Feed `normalizeFacts` a field `{key:"invoice_date", value:"14/09/2026"}`, an amount `₹-5.00`, an amount `₹1.234`, and an unknown key. Expect no fact for each and an `inference.diagnostic` log line naming the key and reason (`Invalid date`, `Invalid amount`, `Unmapped field`) with no value. → AC-4 · value source: parse a date, parse money, ignore an unknown key
- [ ] Give the vendor name a `"` and a newline via a review edit. Expect the Turtle literal escaped (`\"`, `\n`) and the subject IRI `<http://example.invalid/id/` plus `encodeURIComponent(documentId)`. → AC-15 · value source: Turtle subject, Turtle literals
- [ ] Recompute the SHA-256 of the canonical JSON of the sorted canonical facts plus `invoice-v1`. Expect it to equal `certificate.inputHash`. → AC-15 · value source: `inputHash`
- [ ] Unset `INFERENCE_BACKEND`, or set ` TS `. Expect `engineUsed` `ts-symbolic-engine`. Set `bogus` → `501` `not_configured`, not a `ts` result. → AC-6 · value source: `engineUsed`
- [ ] `INFERENCE_BACKEND=http INFERENCE_SERVICE_URL=http://127.0.0.1:9` → `501` `not_configured`, and no outbound connection (watch with `lsof -i :9` or a listener). → AC-8 · value source: HTTP result
- [ ] `INFERENCE_BACKEND=cli OPEN_ONTOLOGIES_BIN=/no/such/bin` → `501` `binary_missing`. A fake script that exits `1` → `502` `crashed`. One that sleeps 10 s → `502` `timeout` after about 5 s. One that prints `not json` → `502` `bad_output`. One that prints a valid `{inferredFacts, findings}` → `200` with `engineUsed` `open-ontologies-cli`. → AC-7 · value source: CLI timeout, CLI binary
- [ ] After each CLI run, `ls <DATA_DIR>/inference-runs/`. Expect it empty. Error bodies never contain document text, Turtle, or the temp path. → AC-7
- [ ] `rg -n "from \"@/inference" src/jobs src/extraction` returns nothing, and `git diff src/jobs/types.ts src/extraction/provider.ts` is empty. → AC-2
- [ ] `npm run check:colors` passes. `npm run build` passes the budget gate with `/jobs/[id]` under `137216` gzipped bytes. → AC-16

## Acceptance-criteria coverage

- AC-1 covered by the live preview call, the unchanged events and review, and the 404 and 400 cases
- AC-2 covered by the unchanged events and the import and diff check
- AC-3 covered by the provenance check, the review edit steps, and the review only confidence step
- AC-4 covered by the `12450000` paise and `INR` check and the bad date and amount diagnostics
- AC-5 covered by the missing fixture and the cleared vendor name
- AC-6 covered by the default engine call and the selector steps
- AC-7 covered by the fake executable steps and the run directory check
- AC-8 covered by the http backend steps
- AC-9 covered by the valid fixture in the UI and over curl
- AC-10 covered by the contradictory fixture
- AC-11 covered by the missing fixture
- AC-12 covered by the baseline warnings, the approved review edit, and inferred confidence
- AC-13 covered by the missing fixture and the GSTIN prefix and format edits
- AC-14 covered by the saved example banner steps and the fixture file match
- AC-15 covered by the details panel, the repeat check, the escape step, the hash recompute, and the copy read
- AC-16 covered by the panel load, severity, premise click, flag off, and budget steps
- AC-17 covered by the span log line
- AC-18 covered by the preset steps, the omitted preset, and the unchanged review after a preset

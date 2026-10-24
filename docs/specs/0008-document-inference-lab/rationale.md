# 0008 rationale · Document inference lab

## Context

An operator can already drop a document, watch a job, and edit the extracted fields. Those fields are candidates. Nothing in the console checks whether they can stand together, or what follows from them. A due date can come before the invoice date. A total can disagree with its parts. A required field can be missing.

The demo has to keep working for a visitor with no extra software, including a later deploy of the Next.js app to Vercel Hobby. That host cannot hold a native binary, a long running process, or the local SQLite file. Idle cost has to stay near zero, because the page should remain up when nobody is running a check. Inferred conclusions have to stay locked by tests, which is why this feature is Beta.

If this stays undecided, a build would have to guess. It might write conclusions into the job event log, treat a missing field as a false value, or describe a passed check as proof that a claim should be paid. It might also pick a host, a binary, or a language model on its own.

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

## Rationale

The console is a portfolio demo that already runs on a mock extractor and a local job store. The lab has to sit beside that, on a machine with no extra install, and still be the thing a later Vercel Hobby deploy can serve. A TypeScript checker meets that force. The binary stays an opt in for a local machine, because putting it on Vercel would break the host constraint in Context.

The result type is fixed now so a later Cloud Run adapter can return the same object without a rewrite of the panel. Shipping that host in this phase would spend the demo on a deploy, a cold start, and a burst that scale to zero does not cap. A language model would fight the other force in Context: a missing fact must stay unknown, and a conclusion must be locked by tests.

Extraction keeps proposing candidate fields. The event log stays the source of truth for the job. Inference reads that log and the saved review, then stops.

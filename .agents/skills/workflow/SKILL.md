---
name: workflow
description: "Index and router for the nine JS Mastery workflow skills (scope, audit, architect, develop, check, test, document, sync, debug). Use when you are unsure which skill to run, want the order they go in, want an overview of the whole pipeline, or ask 'which skill next', 'where do I start', or how these skills fit together. Points to each skill; it does not build, spec, test, or document on its own."
---

## Output style (plain words, no dashes, no hyphens)

Write everything this skill produces, files and messages alike, in plain simple language. Talk to the reader as `you`, warm and direct like a colleague. Never use a dash or a hyphen as punctuation. Code, file paths, and command flags keep their hyphens. Short sentences, clear over clever.

## What this skill does

This is the map, not a worker. It tells you what each of the nine JS Mastery skills is for, the order they run in, and which one to reach for next. It writes no code, no spec, no test, no doc. When you know the skill you need, open that skill's own `SKILL.md` (paths below) and follow it.

Each skill lives at `.agents/skills/<name>/SKILL.md`. Read the one you pick; do not read all nine.

## The one rule that keeps them honest

Each skill owns one kind of artifact and stays out of the others:

- `/scope` seeds WHAT to build (the scope), never HOW.
- `/architect` owns every spec (the decisions).
- `/develop` is the only skill that writes app code.
- `/check` and `/test` prove the code; they never edit it.
- `/audit`, `/sync`, `/document` own the durable prose (AGENTS.md, scope reconcile, human facing notes).

If a skill notices work that belongs to another, it stops and points, it does not reach across.

## The nine skills

| Skill | Use it when | It writes |
|---|---|---|
| `/audit` | A repo has no AI context yet, or the AGENTS.md files are missing or stale. Run once to bootstrap, or on one area (`/audit src/auth`). | `AGENTS.md` (plus thin `CLAUDE.md` pointers) |
| `/scope` | You have a product idea or a next slice and need to capture WHAT to build, or want to reconcile scope after shipping. | `docs/scope/` |
| `/architect` | A load bearing decision is unmade: a stack, a provider, a data model, a page design, or `/develop` said a decision is owed. | `docs/specs/` |
| `/develop` | A decision is recorded (or none is owed) and you are ready to build a feature, page, component, API, or data slice. | app code (and UI tokens) |
| `/check` | A change is built and you want to confirm it. `verify` drives the real app against the spec; `review` runs a senior review on a fresh model. | `docs/reviews/` |
| `/test` | You just built or changed code and want a test suite for it (happy path, edges, error states, accessibility). | test files |
| `/debug` | A test fails for an unclear reason, `/check verify` found a failure, or behavior is wrong. Finds the root cause and makes the minimal fix. | the fix (hands a regression test to `/test`) |
| `/document` | A change is done and you need the human facing prose: a PR, changelog, release note, or postmortem. | `docs/` prose |
| `/sync` | A change is complete, around merge, and the durable knowledge needs to catch up with the code. | `AGENTS.md`, scope, spec flags |

## The order

### First, once per repo

1. `/audit` writes the AGENTS.md context every later skill reads. Do this before anything else on a fresh or undocumented repo.

### Then, the loop for each change

2. `/scope` seeds WHAT (skip if the scope already covers this work).
3. `/architect` settles any load bearing decision and writes the spec (skip only when nothing is owed).
4. `/develop` builds from the spec. If a decision is missing it stops and sends you back to `/architect`.
5. `/check verify` proves the behavior against the spec's acceptance criteria.
6. `/test` locks the behavior in a test suite.
7. `/debug` if step 5 or 6 surfaces a failure, then loop back.
8. `/check review` runs a senior review on a fresh model before the PR.
9. `/document` writes the PR, changelog, or release note from the real diff.
10. `/sync` reconciles AGENTS.md, scope, and specs at merge.

Steps are recommendations, not gates. Skip what a change does not need; a tiny fix may be `/debug` then `/document`, a docs only change may be `/sync` alone.

## Which skill next (quick decision)

- No AGENTS.md, or it is stale → `/audit`
- Not sure what to build, or planning a slice → `/scope`
- Facing a real technical choice, or `/develop` said a decision is owed → `/architect`
- Have a spec and are ready to build → `/develop`
- Built it, want to prove it works → `/check verify`, then `/test`
- Something is broken → `/debug`
- Ready for a second pair of eyes before the PR → `/check review`
- Ready to tell humans what changed → `/document`
- Merging and want the docs to match the code → `/sync`

## After you pick

Open that skill's `SKILL.md` and follow it. This index does no work of its own.

# 0003 · Design system & UI foundation

**Status**: Accepted
**Date**: 2026-09-21
**Mode**: FEATURE
**Feature**: Design system & UI foundation (scope #4)

## Summary

A small, cohesive design system for an operator console: calm dark-first surface, one accent, a neutral ladder, and base components (Button, Card, StatusBadge, ProgressBar, Panel, FieldRow) that handle focus and keyboard. Art direction lives in `design.md`; the concrete values live in CSS variables in `app/globals.css`.

## Requirements

- AC-1: A documented token set (color, spacing, radius, type scale) exists as CSS variables and is referenced, not duplicated, elsewhere.
- AC-2: Base components render with visible keyboard focus and meet WCAG AA contrast in the default theme.
- AC-3: A `StatusBadge` renders each `JobStatus` with a distinct, accessible color and a text label (never color alone).
- AC-4: A `ProgressBar` conveys progress both visually and via `aria` attributes.
- AC-5: Components are typed, take no `any`, and are importable via the `@/` alias.

## Decision

- Dark-first, single accent (`--accent`), neutral grey ladder, 4px spacing base, 8px radius. Values in `app/globals.css` `:root`.
- Components in `src/ui/`: `Button`, `Card`, `Panel`, `StatusBadge`, `ProgressBar`, `FieldRow`. Plain CSS via a co-located `ui.module.css` (no CSS-in-JS dependency).
- Status colors: `queued` grey, `processing` blue, `partial` amber, `completed` green, `failed`/`rejected` red — always paired with a text label (AC-3).

## Build plan

1. Token variables in `app/globals.css`. (AC-1)
2. `src/ui/` base components + `ui.module.css`. (AC-2..5)
3. `design.md` pointing at the tokens. (AC-1)

## Consequences

- No UI framework dependency keeps the bundle small (a JD performance signal) and the components fully owned.

## Rationale

A Staff reviewer looks for accessible, reusable primitives and a single source of truth for design values. Plain CSS variables + modules is the smallest thing that demonstrates that.

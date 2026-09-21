# 0003 · Design system & UI foundation

**Status**: Accepted
**Date**: 2026-09-21
**Mode**: FEATURE
**Feature**: Design system & UI foundation (scope #4)

## Summary

A small, cohesive design system for an operator console: calm dark-first surface with a peer light
theme on the same token names, one accent, a neutral ladder, and base components (Button, Card,
StatusBadge, ProgressBar, Panel, FieldRow) that handle focus and keyboard. Art direction and
critique rules live in `design.md`; values live in CSS variables in `app/globals.css`.

## Requirements

- AC-1: A documented token set (color, spacing, radius, type scale) exists as CSS variables and is referenced, not duplicated, elsewhere.
- AC-2: Base components render with visible keyboard focus and meet WCAG AA contrast in the default theme.
- AC-3: A `StatusBadge` renders each `JobStatus` with a distinct, accessible color and a text label (never color alone).
- AC-4: A `ProgressBar` conveys progress both visually and via `aria` attributes.
- AC-5: Components are typed, take no `any`, and are importable via the `@/` alias.
- AC-6: Light and dark resolve through `html[data-theme]` using the same token names; the operator
  can choose System / Light / Dark. Both themes meet WCAG AA for body text and primary actions.

## Decision

- Dark-first fallback, single accent (`--accent`), neutral grey ladder, 4px spacing base, 8px
  radius. Dark values on `:root` / `[data-theme="dark"]`; light values on `[data-theme="light"]`.
- Preference stored as `system` | `light` | `dark` (`doc-intel-theme`). System follows
  `prefers-color-scheme`. A pre-paint script avoids a wrong-theme flash.
- Components in `src/ui/`: `Button`, `Card`, `Panel`, `StatusBadge`, `ProgressBar`, `FieldRow`.
  Plain CSS via a co-located `ui.module.css` (no CSS-in-JS dependency). Theme control in
  `src/theme/`.
- Status colors: `queued` grey, `processing` blue, `partial` amber, `completed` green,
  `failed`/`rejected` red — always paired with a text label (AC-3). Hues may shift per theme for
  contrast; the name mapping does not.
- `design.md` is the critique contract: reviews enforce its rules rather than substituting a
  third-party visual language.

## Build plan

1. Token variables in `app/globals.css`. (AC-1)
2. `src/ui/` base components + `ui.module.css`. (AC-2..5)
3. `design.md` pointing at the tokens. (AC-1)

## Consequences

- No UI framework dependency keeps the bundle small (a JD performance signal) and the components fully owned.
- Light mode is chrome-only: the PDF page stays `--paper` (light) so scanned documents do not invert.

## Rationale

A Staff reviewer looks for accessible, reusable primitives and a single source of truth for design values. Plain CSS variables + modules is the smallest thing that demonstrates that.

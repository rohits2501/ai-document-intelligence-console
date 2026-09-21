# Design system

Art direction for the Document Intelligence Console. **This file is the critique contract.** Token
values live only in `app/globals.css`. A review that wants a different look (landing-page chrome,
Awwwards motion, a new palette) is out of scope unless this file changes first.

## Character

Calm, dense, operator-facing. Dark is the primary art direction; light is a first-class peer that
uses the **same token names**. One accent, used sparingly for primary actions and the active state.
Everything else is a neutral grey ladder so document content and extracted data stand out.

This is a job console (upload → stream → review), not a marketing site. Do not add decorative
illustration, hero copy, or animation that competes with status and fields.

## Themes

`html[data-theme="dark"|"light"]` is the only theme switch. Components must not branch on theme.

| Preference | Behavior |
| :--- | :--- |
| `system` (default) | Follows `prefers-color-scheme` |
| `light` / `dark` | Locked; stored in `localStorage` key `doc-intel-theme` |

- Default rendered theme before JS: `dark` (`data-theme="dark"` on `<html>`).
- A blocking script in `ThemeScript` applies the stored / system choice before paint.
- `color-scheme` on `:root` / `[data-theme]` must match so native controls stay consistent.
- `--paper` is always a light page (PDF canvas). It does not invert with the chrome.

## Tokens (`app/globals.css`)

Color (both themes must define every name): `--bg`, `--surface`, `--surface-2`, `--border`,
`--text`, `--text-muted`, `--accent`, `--accent-contrast`, `--accent-soft`, `--scrim`, `--shadow`,
`--paper`, `--status-queued`, `--status-processing`, `--status-partial`, `--status-completed`,
`--status-failed`.

Spacing: `--space-1..6` on a 4px base.  
Radius: `--radius` (8px), `--radius-sm` (4px).  
Type: `--font-sans` (system stack), `--text-xs..2xl`.

## Critique rules (fail the review if broken)

1. **Tokens only.** No raw hex, `rgb()`, or `px` in components except: (a) layout math that cannot
   be a token (virtualizer offsets), (b) `0` / `none`. New colors go in `globals.css` first.
2. **Both themes.** A change that looks correct in dark and broken in light is incomplete. Check
   `--text` on `--surface`, `--text-muted` on `--bg`, and `--accent` as a link/button.
3. **Status is never color alone.** Use `StatusBadge` (dot + label). Overlay boxes may use status
   color only if they also have an accessible name (`aria-label` / `title`).
4. **Focus.** Every interactive control has a visible `:focus-visible` ring (`--accent`).
5. **Contrast.** Target WCAG AA in **both** themes for text, badges, and the theme toggle.
6. **No second design system.** Do not introduce a new card style, font, or radius to “match a
   mock” unless `design.md` and spec 0003 are updated in the same change.
7. **Density over decoration.** Prefer one primary button, token borders, and the existing `Panel`.
   Do not add drop shadows except `var(--shadow)` on floating chrome (walkthrough, tour pill).
8. **Motion.** Transitions stay under ~200ms; honor `prefers-reduced-motion` for looping motion
   (walkthrough pulse already does).

## Components (`src/ui/`)

`Button`, `Card`, `Panel`, `StatusBadge`, `ProgressBar`, `FieldRow`, `SourceChip`. Typed, imported
via `@/ui`, styled in `src/ui/ui.module.css`. Theme chrome: `@/theme/ThemeToggle` + `ThemeScript`.
`SourceChip` names a field's origin (document + page) and selects it to highlight the viewer box.

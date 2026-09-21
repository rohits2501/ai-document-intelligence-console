# Design system

Art direction for the Document Intelligence Console. The real values live as CSS variables in `app/globals.css`; this file only describes intent so a value is never written twice.

## Character

Calm, dense, operator-facing. Dark-first. One accent, used sparingly for primary actions and the active state. Everything else is a neutral grey ladder so document content and extracted data are what stand out.

## Tokens (defined in `app/globals.css` `:root`)

- Color: `--bg`, `--surface`, `--surface-2`, `--border`, `--text`, `--text-muted`, `--accent`, and status colors `--status-queued|processing|partial|completed|failed`.
- Spacing: `--space-1..6` on a 4px base.
- Radius: `--radius` (8px), `--radius-sm` (4px).
- Type: `--font-sans` (system stack), scale `--text-xs..2xl`.

## Rules

- Reference tokens, never hardcode hex or px in components.
- Status is never conveyed by color alone; always pair with a label (`StatusBadge`).
- Every interactive element has a visible `:focus-visible` ring.
- Target WCAG AA contrast in the default (dark) theme.

## Components (`src/ui/`)

`Button`, `Card`, `Panel`, `StatusBadge`, `ProgressBar`, `FieldRow`. Each is typed, alias-imported (`@/ui/...`), and styled via `src/ui/ui.module.css`.

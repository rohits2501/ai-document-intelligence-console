"use client";

import { useEffect, useState } from "react";
import {
  THEME_PREFERENCES,
  THEME_STORAGE_KEY,
  applyResolvedTheme,
  isThemePreference,
  resolveTheme,
  type ThemePreference,
} from "./theme";

const LABEL: Record<ThemePreference, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

/**
 * Cycles system → light → dark. System follows `prefers-color-scheme`; the resolved theme is
 * written to `html[data-theme]` so every token in globals.css updates together.
 */
export function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>("system");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    setPreference(isThemePreference(stored) ? stored : "system");
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const sync = () => applyResolvedTheme(resolveTheme(preference, media.matches));
    sync();
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [preference, ready]);

  return (
    <div
      role="group"
      aria-label="Color theme"
      style={{
        display: "inline-flex",
        gap: 2,
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
        padding: 2,
      }}
    >
      {THEME_PREFERENCES.map((value) => {
        const active = preference === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            onClick={() => setPreference(value)}
            style={{
              border: 0,
              borderRadius: "var(--radius-sm)",
              padding: "var(--space-1) var(--space-2)",
              fontSize: "var(--font-size-xs)",
              fontFamily: "inherit",
              cursor: "pointer",
              background: active ? "var(--accent-subtle)" : "transparent",
              color: active ? "var(--accent)" : "var(--text-muted)",
            }}
          >
            {LABEL[value]}
          </button>
        );
      })}
    </div>
  );
}

import { THEME_STORAGE_KEY } from "./theme";

/**
 * Runs before paint so the first frame matches the stored / system theme (no light flash on dark).
 * Must stay a tiny IIFE — no imports at runtime.
 */
export function ThemeScript() {
  const js = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var s=localStorage.getItem(k);var p=s==="light"||s==="dark"||s==="system"?s:"system";var light=window.matchMedia("(prefers-color-scheme: light)").matches;var t=p==="light"||p==="dark"?p:(light?"light":"dark");var r=document.documentElement;r.setAttribute("data-theme",t);r.style.colorScheme=t;}catch(e){document.documentElement.setAttribute("data-theme","dark");}})();`;
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}

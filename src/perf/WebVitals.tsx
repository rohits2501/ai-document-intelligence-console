"use client";

import { useReportWebVitals } from "next/web-vitals";
import { vitalBreach } from "./field-budgets";

/**
 * Field signal for the vitals budgets. A session that crosses a ceiling logs one structured
 * line. There is no collector behind it; the number is the ceiling, and this is how a breach
 * becomes visible.
 */
export function WebVitals() {
  useReportWebVitals((metric) => {
    const breach = vitalBreach(metric.name, metric.value);
    if (!breach) return;
    console.warn(
      JSON.stringify({
        level: "warn",
        message: "web-vital over budget",
        name: breach.name,
        value: breach.value,
        max: breach.max,
        rating: metric.rating,
        id: metric.id,
      }),
    );
  });
  return null;
}

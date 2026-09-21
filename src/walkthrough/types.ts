/**
 * Types for the owned product walkthrough (no third party tour library).
 *
 * A tour is an ordered list of steps. Each step points at a target element by its `data-tour`
 * attribute; the Walkthrough component resolves the target at runtime, draws a spotlight over it,
 * and anchors a popover beside it. A step with `target: null` renders a centered popover (used for
 * the welcome and closing steps that are not tied to one region).
 */

/** Which edge of the target the popover prefers. It flips/clamps automatically when space is tight. */
export type PopoverPlacement = "top" | "bottom" | "left" | "right" | "auto";

export interface TourStep {
  /** Stable id, used for React keys and analytics-style logging. */
  id: string;
  /** `data-tour` value of the element to highlight, or null for a centered, target-less step. */
  target: string | null;
  /** Short label shown as a pill above the title (e.g. "Live stream", "Human in the loop"). */
  badge?: string;
  /** Popover heading. */
  title: string;
  /** One or two sentences explaining the highlighted surface. */
  body: string;
  /** Preferred popover placement relative to the target. Defaults to "auto". */
  placement?: PopoverPlacement;
}

export interface Tour {
  /** Stable id for the tour (e.g. "home", "job-console"). */
  id: string;
  /** Human readable name shown on the restart control. */
  name: string;
  steps: TourStep[];
}

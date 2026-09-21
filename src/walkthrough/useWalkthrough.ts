"use client";

import { useCallback, useEffect, useState } from "react";
import type { Tour, TourStep } from "./types";

export interface WalkthroughController {
  active: boolean;
  index: number;
  step: TourStep | undefined;
  total: number;
  isFirst: boolean;
  isLast: boolean;
  start: () => void;
  stop: () => void;
  next: () => void;
  back: () => void;
}

/**
 * State machine for a single tour: active flag, current step index, and the navigation actions.
 * DOM measurement and spotlight positioning live in the Walkthrough component; this hook only owns
 * the "which step, is it running" state plus keyboard shortcuts.
 *
 * autoStart runs the tour once per mount (the "every session" demo behavior the operator picked):
 * a fresh page load restarts it, and skipping only dismisses it for that view. The delay lets the
 * target surfaces mount before the first spotlight is measured.
 */
export function useWalkthrough(
  tour: Tour,
  { enabled, autoStart }: { enabled: boolean; autoStart: boolean },
): WalkthroughController {
  const total = tour.steps.length;
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);

  const start = useCallback(() => {
    if (!enabled || total === 0) return;
    setIndex(0);
    setActive(true);
  }, [enabled, total]);

  const stop = useCallback(() => setActive(false), []);

  const next = useCallback(() => {
    setIndex((i) => {
      if (i + 1 >= total) {
        setActive(false);
        return i;
      }
      return i + 1;
    });
  }, [total]);

  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    if (!enabled || !autoStart) return;
    const t = window.setTimeout(() => {
      setIndex(0);
      setActive(true);
    }, 450);
    return () => window.clearTimeout(t);
  }, [enabled, autoStart]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setActive(false);
      } else if (e.key === "ArrowRight") {
        next();
      } else if (e.key === "ArrowLeft") {
        back();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, next, back]);

  return {
    active,
    index,
    step: tour.steps[index],
    total,
    isFirst: index === 0,
    isLast: index === total - 1,
    start,
    stop,
    next,
    back,
  };
}

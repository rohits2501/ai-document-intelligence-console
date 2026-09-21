"use client";

import { useCallback, useEffect, useState } from "react";
import type { Tour, TourStep } from "./types";
import { setTourDismissed, wasTourDismissed } from "./dismissed";

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
 * autoStart runs once for a first-time visitor (or after storage is cleared). Skip, Escape, and
 * Done persist a dismissed flag so a reload or revisit stays quiet until Show tour is clicked.
 * The delay lets the target surfaces mount before the first spotlight is measured.
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
    setTourDismissed(tour.id, false);
    setIndex(0);
    setActive(true);
  }, [enabled, total, tour.id]);

  const stop = useCallback(() => {
    setTourDismissed(tour.id, true);
    setActive(false);
  }, [tour.id]);

  const next = useCallback(() => {
    setIndex((i) => {
      if (i + 1 >= total) {
        setTourDismissed(tour.id, true);
        setActive(false);
        return i;
      }
      return i + 1;
    });
  }, [total, tour.id]);

  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    if (!enabled || !autoStart) return;
    if (wasTourDismissed(tour.id)) return;
    const t = window.setTimeout(() => {
      setIndex(0);
      setActive(true);
    }, 450);
    return () => window.clearTimeout(t);
  }, [enabled, autoStart, tour.id]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        stop();
      } else if (e.key === "ArrowRight") {
        next();
      } else if (e.key === "ArrowLeft") {
        back();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, next, back, stop]);

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

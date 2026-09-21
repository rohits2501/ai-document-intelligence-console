"use client";

import { useCallback, useEffect, useLayoutEffect, useId, useRef, useState } from "react";
import { Button } from "@/ui";
import { flags } from "@/flags";
import type { PopoverPlacement, Tour } from "./types";
import { useWalkthrough } from "./useWalkthrough";
import styles from "./walkthrough.module.css";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const HOLE_PAD = 6;
const GAP = 12;

function place(
  rect: Rect,
  pw: number,
  ph: number,
  preferred: PopoverPlacement,
): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  let placement = preferred;
  if (placement === "auto") {
    const space = {
      bottom: vh - (rect.top + rect.height),
      top: rect.top,
      right: vw - (rect.left + rect.width),
      left: rect.left,
    };
    placement = (Object.keys(space) as PopoverPlacement[]).reduce((best, side) =>
      space[side as keyof typeof space] > space[best as keyof typeof space] ? side : best,
    ) as PopoverPlacement;
  }

  let top: number;
  let left: number;
  switch (placement) {
    case "top":
      top = rect.top - GAP - ph;
      left = cx - pw / 2;
      break;
    case "left":
      top = cy - ph / 2;
      left = rect.left - GAP - pw;
      break;
    case "right":
      top = cy - ph / 2;
      left = rect.left + rect.width + GAP;
      break;
    case "bottom":
    default:
      top = rect.top + rect.height + GAP;
      left = cx - pw / 2;
      break;
  }

  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
  return {
    top: clamp(top, 8, Math.max(8, vh - ph - 8)),
    left: clamp(left, 8, Math.max(8, vw - pw - 8)),
  };
}

/**
 * Owned product walkthrough. Draws a spotlight over the current step's target and anchors a popover
 * beside it, with a step counter, Back / Next / Done, and Skip. Runs only when the walkthrough
 * feature flag is on. Steps whose target cannot be found are skipped automatically (e.g. the
 * Diagnostics step when that panel's flag is off), keeping the tour honest about the real UI.
 */
export function Walkthrough({ tour }: { tour: Tour }) {
  const enabled = flags.walkthrough;
  const wt = useWalkthrough(tour, { enabled, autoStart: true });
  const { active, index, step, total, isFirst, isLast, start, stop, next, back } = wt;

  const [rect, setRect] = useState<Rect | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const targetRef = useRef<Element | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const restartRef = useRef<HTMLButtonElement>(null);

  const titleId = useId();
  const bodyId = useId();

  const measure = useCallback(() => {
    const el = targetRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({
      top: r.top - HOLE_PAD,
      left: r.left - HOLE_PAD,
      width: r.width + HOLE_PAD * 2,
      height: r.height + HOLE_PAD * 2,
    });
  }, []);

  // Resolve and measure the current step's target (or center it when target is null).
  useEffect(() => {
    if (!active || !step) return;
    if (step.target === null) {
      targetRef.current = null;
      setRect(null);
      return;
    }
    let cancelled = false;
    let tries = 0;
    let timer = 0;
    const locate = () => {
      if (cancelled) return;
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      if (el) {
        targetRef.current = el;
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        measure();
        // Re-measure after the smooth scroll settles.
        timer = window.setTimeout(measure, 260);
        return;
      }
      tries += 1;
      if (tries > 12) {
        next(); // target genuinely absent (e.g. flag-gated panel) → skip this step
        return;
      }
      timer = window.setTimeout(locate, 60);
    };
    locate();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [active, index, step, measure, next]);

  // Keep the spotlight glued to the target while the page scrolls or resizes.
  useEffect(() => {
    if (!active) return;
    const onMove = () => measure();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [active, measure]);

  // Position the popover once we know the hole and the popover's own size.
  useLayoutEffect(() => {
    if (!active || !step) return;
    if (step.target === null || !rect) {
      setPos(null);
      return;
    }
    const pop = popoverRef.current;
    if (!pop) return;
    const { width, height } = pop.getBoundingClientRect();
    setPos(place(rect, width, height, step.placement ?? "auto"));
  }, [active, step, rect]);

  // Move focus into the popover on each step; return it to the restart pill on close.
  useEffect(() => {
    if (active) primaryRef.current?.focus();
    else restartRef.current?.focus();
  }, [active, index]);

  if (!enabled) return null;

  if (!active || !step) {
    return (
      <button ref={restartRef} type="button" className={styles.restart} onClick={start}>
        <span className={styles.restartDot} aria-hidden />
        Show {tour.name}
      </button>
    );
  }

  const centered = step.target === null || !rect;

  return (
    <>
      {centered ? (
        <div className={styles.centeredScrim} aria-hidden />
      ) : (
        <div
          className={styles.spotlight}
          aria-hidden
          style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
        />
      )}

      <div
        ref={popoverRef}
        role="dialog"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className={`${styles.popover} ${centered ? styles.popoverCentered : ""}`}
        style={centered || !pos ? undefined : { top: pos.top, left: pos.left }}
      >
        {step.badge ? <span className={styles.badge}>{step.badge}</span> : null}
        <h2 id={titleId} className={styles.title}>
          {step.title}
        </h2>
        <p id={bodyId} className={styles.body}>
          {step.body}
        </p>
        <div className={styles.footer}>
          <span className={styles.counter} aria-live="polite">
            Step {index + 1} of {total}
          </span>
          <div className={styles.actions}>
            <button type="button" className={styles.skip} onClick={stop}>
              Skip
            </button>
            {!isFirst ? (
              <Button type="button" onClick={back}>
                Back
              </Button>
            ) : null}
            <Button ref={primaryRef} type="button" variant="primary" onClick={next}>
              {isLast ? "Done" : "Next"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

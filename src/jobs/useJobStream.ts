"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { useBatchedCallback } from "@tanstack/react-pacer";
import { JOB_EVENT_TYPES, JobEvent } from "./types";
import { initialJobState, jobReducer, type JobViewState } from "./job-state";
import { flags } from "@/flags";
import { patchPerf, recordSseApply } from "@/perf/store";

/**
 * Subscribe to a job's SSE event stream. Replay bursts are batched to one React update per frame
 * so a 2k event log does not commit 2k times.
 */
export function useJobStream(jobId: string | null): {
  state: JobViewState;
  connected: boolean;
} {
  const [state, dispatch] = useReducer(jobReducer, initialJobState);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  const applyBatch = useBatchedCallback(
    (events: JobEvent[]) => {
      for (const event of events) dispatch(event);
      if (flags.perfHud) recordSseApply(events.length);
    },
    { wait: 16, maxSize: 64, onUnmount: (batcher) => batcher.flush() },
  );

  useEffect(() => {
    if (!jobId) return;
    const es = new EventSource(`/api/jobs/${jobId}/events`);
    esRef.current = es;

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    const handle = (raw: MessageEvent) => {
      try {
        const parsed = JobEvent.parse(JSON.parse(raw.data));
        applyBatch(parsed);
      } catch {
        // ignore malformed frames
      }
    };

    for (const type of JOB_EVENT_TYPES) {
      es.addEventListener(type, handle as EventListener);
    }
    es.addEventListener("message", handle as EventListener);

    return () => {
      es.close();
      esRef.current = null;
      setConnected(false);
    };
  }, [jobId, applyBatch]);

  useEffect(() => {
    if (!flags.perfHud) return;
    patchPerf({ sseEventCount: state.events.length });
  }, [state.events.length]);

  return { state, connected };
}

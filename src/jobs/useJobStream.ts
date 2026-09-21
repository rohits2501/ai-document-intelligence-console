"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { JOB_EVENT_TYPES, JobEvent } from "./types";
import { initialJobState, jobReducer, type JobViewState } from "./job-state";

/**
 * Subscribe to a job's SSE event stream. EventSource gives us automatic reconnection with
 * Last-Event-ID for free; the reducer is idempotent per event id so replayed events are safe.
 * The connection is a disposable cursor; all durable state lives server-side in the event log.
 */
export function useJobStream(jobId: string | null): {
  state: JobViewState;
  connected: boolean;
} {
  const [state, dispatch] = useReducer(jobReducer, initialJobState);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!jobId) return;
    const es = new EventSource(`/api/jobs/${jobId}/events`);
    esRef.current = es;

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false); // browser will retry with Last-Event-ID

    const handle = (raw: MessageEvent) => {
      try {
        const parsed = JobEvent.parse(JSON.parse(raw.data));
        dispatch(parsed);
      } catch {
        // ignore malformed frames (e.g. heartbeats arrive as comments, not data)
      }
    };

    // Server sends named events (`event: <type>`); listen to each known type.
    for (const type of JOB_EVENT_TYPES) {
      es.addEventListener(type, handle as EventListener);
    }
    // Also catch any default `message` frames.
    es.addEventListener("message", handle as EventListener);

    return () => {
      es.close();
      esRef.current = null;
      setConnected(false);
    };
  }, [jobId]);

  return { state, connected };
}

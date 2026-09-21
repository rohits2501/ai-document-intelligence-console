import { NextRequest } from "next/server";
import { runtime as store } from "@/jobs/runtime";
import { isTerminal, statusForEvent, type JobEvent } from "@/jobs/types";
import { log } from "@/telemetry";
import { withStore } from "@/jobs/store-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * SSE endpoint: a disposable cursor over the append only event log (spec 0002 AC-5).
 * Replays from Last-Event-ID, then follows live. Sends heartbeat comments to keep the
 * connection alive, and closes after a terminal event. Reconnect/refresh/multi-tab all work
 * because the log, not the connection, is the source of truth.
 *
 * Replay happens synchronously before subscribing: the JS runtime is single-threaded, so no
 * event can be appended between the `since()` snapshot and `subscribe()`, which keeps ordering
 * race-free without a buffer.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  return withStore(() => {
    const jobId = params.id;
    const job = store.jobs.get(jobId);
    if (!job) {
      return new Response("unknown job", { status: 404 });
    }

    const lastEventId = readLastEventId(req);
    // Read the snapshot in the handler so a corrupt row becomes a 5xx, not a broken stream.
    const missed = store.eventLog.since(jobId, lastEventId);
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;
        // Declared up front so cleanup() can safely reference them even when it runs during replay
        // (before the live subscription / heartbeat are attached).
        let unsubscribe: (() => void) | null = null;
        let heartbeat: ReturnType<typeof setInterval> | null = null;

        const cleanup = () => {
          if (closed) return;
          closed = true;
          if (heartbeat) clearInterval(heartbeat);
          if (unsubscribe) unsubscribe();
          try {
            controller.close();
          } catch {
            // already closed
          }
        };

        const send = (event: JobEvent) => {
          if (closed) return;
          const payload =
            `id: ${event.id}\n` + `event: ${event.type}\n` + `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        };

        const isTerminalEvent = (event: JobEvent) => {
          const status = statusForEvent(event.type);
          return (status !== null && isTerminal(status)) || event.type === "cancelled";
        };

        // 1) Replay everything after Last-Event-ID.
        let terminalSeen = false;
        for (const event of missed) {
          send(event);
          if (isTerminalEvent(event)) terminalSeen = true;
        }
        if (terminalSeen) {
          cleanup();
          return;
        }

        // Reconnect to an already-terminal job: replay may be empty but there is nothing more to
        // stream, so close instead of holding the connection open on a heartbeat forever.
        const current = store.jobs.get(jobId);
        if (current && isTerminal(current.status)) {
          cleanup();
          return;
        }

        // 2) Follow live.
        unsubscribe = store.eventLog.subscribe(jobId, (event) => {
          send(event);
          if (isTerminalEvent(event)) cleanup();
        });

        // 3) Heartbeat so intermediaries do not kill the idle connection.
        heartbeat = setInterval(() => {
          if (closed) return;
          controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`));
        }, 15000);

        req.signal.addEventListener("abort", cleanup, { once: true });
        log.debug("sse:open", { job_id: jobId });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  });
}

function readLastEventId(req: NextRequest): number {
  const header = req.headers.get("last-event-id");
  const query = req.nextUrl.searchParams.get("lastEventId");
  const raw = header ?? query ?? "0";
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

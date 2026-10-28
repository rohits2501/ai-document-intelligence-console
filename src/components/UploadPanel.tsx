"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Panel, ProgressBar } from "@/ui";
import { uploadFileResumable, type UploadProgress } from "@/upload/chunked-uploader";

/**
 * Resumable chunked upload with live progress and cancel. The uploader remembers an interrupted
 * upload in IndexedDB and resumes from the committed offset, so re-selecting the same file after a
 * failure or reload continues rather than restarting.
 */
export function UploadPanel() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  async function start(file: File) {
    setBusy(true);
    setError(null);
    setProgress({ uploaded: 0, total: file.size, pct: 0 });
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const { documentId } = await uploadFileResumable(file, {
        signal: controller.signal,
        onProgress: setProgress,
      });
      const jobRes = await fetch("/api/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ documentId, kind: "extract" }),
      });
      if (!jobRes.ok) throw new Error(`could not start job (${jobRes.status})`);
      const { jobId } = (await jobRes.json()) as { jobId: string };
      router.push(`/jobs/${jobId}`);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setError("Upload cancelled. Re-selecting the same file will resume where it left off.");
      } else {
        setError(e instanceof Error ? e.message : "something went wrong");
      }
      setBusy(false);
    }
  }

  function cancel() {
    abortRef.current?.abort();
  }

  return (
    <Panel title="Upload a document" tourId="upload-panel">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void start(file);
        }}
        style={{
          border: `1px dashed ${dragging ? "var(--accent)" : "var(--border)"}`,
          borderRadius: "var(--radius-md)",
          padding: "var(--space-8)",
          textAlign: "center",
          background: dragging ? "var(--bg-subtle)" : "transparent",
        }}
      >
        <p style={{ color: "var(--text-muted)", marginTop: 0 }}>
          Drop a PDF or image here, or choose a file. Uploads are chunked and resumable; processing
          uses a mock provider by default, so no keys are needed.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void start(file);
          }}
        />

        {busy && progress ? (
          <div style={{ display: "grid", gap: "var(--space-2)", maxWidth: 420, margin: "0 auto" }}>
            <ProgressBar value={progress.pct} max={100} />
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--text-muted)" }}>
              Uploading… {progress.pct}%
            </div>
            <Button variant="danger" onClick={cancel}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button variant="primary" onClick={() => inputRef.current?.click()}>
            Choose file
          </Button>
        )}

        {error && (
          <p role="alert" style={{ color: "var(--warning)", marginBottom: 0 }}>
            {error}
          </p>
        )}
      </div>
    </Panel>
  );
}

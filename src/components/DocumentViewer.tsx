"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Document, Page, pdfjs } from "react-pdf";
import type { ExtractedField } from "@/jobs/types";
import { flags } from "@/flags";
import { patchPerf } from "@/perf/store";

// Worker is served locally from /public so the viewer works offline (no CDN dependency).
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

const PAGE_WIDTH = 520;
const A4_RATIO = 0.707; // width/height
const EST_PAGE_HEIGHT = Math.round(PAGE_WIDTH / A4_RATIO) + 16;

/**
 * Virtualized document viewer. Only the pages near the viewport are mounted, so a 500-page document
 * stays responsive (a core JD signal). Extraction results are drawn as normalized bounding boxes
 * over the matching page; the selected field's box is highlighted and scrolled into view.
 *
 * Real PDFs render via pdf.js; non-PDFs or load failures fall back to virtualized page frames so
 * the overlay + virtualization story still holds.
 */
const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif"];

function isImageName(name: string | null | undefined): boolean {
  if (!name) return false;
  const ext = name.toLowerCase().split(".").pop() ?? "";
  return IMAGE_EXTENSIONS.includes(ext);
}

export function DocumentViewer({
  documentId,
  documentName,
  pageCountHint = 4,
  fields,
  selectedKey,
  onSelectField,
}: {
  documentId: string;
  documentName?: string | null;
  pageCountHint?: number;
  fields: ExtractedField[];
  selectedKey: string | null;
  onSelectField: (key: string) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState<number>(pageCountHint);
  const [failed, setFailed] = useState(false);
  const fileUrl = `/api/documents/${documentId}/file`;

  const virtualizer = useVirtualizer({
    count: numPages,
    getScrollElement: () => parentRef.current,
    estimateSize: () => EST_PAGE_HEIGHT,
    overscan: 2,
  });
  const virtualCount = virtualizer.getVirtualItems().length;

  useEffect(() => {
    if (!flags.perfHud) return;
    patchPerf({ pagesMounted: virtualCount, pagesTotal: numPages });
  }, [virtualCount, numPages]);

  const fieldsByPage = useMemo(() => {
    const map = new Map<number, ExtractedField[]>();
    for (const f of fields) {
      if (!f.bbox) continue;
      const page = f.page ?? 1;
      const arr = map.get(page) ?? [];
      arr.push(f);
      map.set(page, arr);
    }
    return map;
  }, [fields]);

  // Scroll the selected field's page into view.
  useEffect(() => {
    if (!selectedKey) return;
    const f = fields.find((x) => x.key === selectedKey);
    if (f?.page) virtualizer.scrollToIndex(f.page - 1, { align: "center" });
  }, [selectedKey, fields, virtualizer]);

  // Images render as a single page via <img>; only PDFs go through pdf.js + virtualization.
  if (isImageName(documentName)) {
    return (
      <ImageViewer
        fileUrl={fileUrl}
        fields={fields.filter((f) => (f.page ?? 1) === 1)}
        selectedKey={selectedKey}
        onSelectField={onSelectField}
      />
    );
  }

  const pages = (
    <div
      style={{
        height: virtualizer.getTotalSize(),
        position: "relative",
        width: PAGE_WIDTH,
        margin: "0 auto",
      }}
    >
      {virtualizer.getVirtualItems().map((item) => {
        const pageNumber = item.index + 1;
        const pageFields = fieldsByPage.get(pageNumber) ?? [];
        return (
          <div
            key={item.key}
            data-index={item.index}
            data-perf="page"
            ref={virtualizer.measureElement}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              transform: `translateY(${item.start}px)`,
              width: PAGE_WIDTH,
              padding: "8px 0",
            }}
          >
            <div style={{ position: "relative", background: "var(--paper)", borderRadius: 2 }}>
              {failed ? (
                <PageFrame pageNumber={pageNumber} />
              ) : (
                <Page
                  pageNumber={pageNumber}
                  width={PAGE_WIDTH}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                  loading={<PageFrame pageNumber={pageNumber} />}
                  error={<PageFrame pageNumber={pageNumber} />}
                />
              )}
              <Overlay
                fields={pageFields}
                selectedKey={selectedKey}
                onSelectField={onSelectField}
              />
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div
      ref={parentRef}
      style={{
        height: 560,
        overflow: "auto",
        background: "var(--bg-subtle)",
        borderRadius: "var(--radius-sm)",
      }}
    >
      {failed ? (
        pages
      ) : (
        <Document
          file={fileUrl}
          onLoadSuccess={(d: { numPages: number }) => {
            setNumPages(d.numPages);
            setFailed(false);
          }}
          onLoadError={() => setFailed(true)}
          loading={<ViewerNote text="Loading document…" />}
          error={null}
        >
          {pages}
        </Document>
      )}
    </div>
  );
}

/**
 * Single-image document view. The uploaded image is the page; extraction boxes overlay it exactly
 * as they do on a PDF page. No virtualization is needed for one image.
 */
function ImageViewer({
  fileUrl,
  fields,
  selectedKey,
  onSelectField,
}: {
  fileUrl: string;
  fields: ExtractedField[];
  selectedKey: string | null;
  onSelectField: (key: string) => void;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!flags.perfHud) return;
    patchPerf({ pagesMounted: 1, pagesTotal: 1 });
  }, []);

  return (
    <div
      style={{
        height: 560,
        overflow: "auto",
        background: "var(--bg-subtle)",
        borderRadius: "var(--radius-sm)",
      }}
    >
      <div style={{ width: PAGE_WIDTH, margin: "0 auto", padding: "8px 0" }}>
        <div style={{ position: "relative", background: "var(--paper)", borderRadius: 2 }}>
          {failed ? (
            <PageFrame pageNumber={1} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={fileUrl}
              alt="Uploaded document"
              width={PAGE_WIDTH}
              onError={() => setFailed(true)}
              style={{ display: "block", width: PAGE_WIDTH, height: "auto" }}
            />
          )}
          <Overlay fields={fields} selectedKey={selectedKey} onSelectField={onSelectField} />
        </div>
      </div>
    </div>
  );
}

function Overlay({
  fields,
  selectedKey,
  onSelectField,
}: {
  fields: ExtractedField[];
  selectedKey: string | null;
  onSelectField: (key: string) => void;
}) {
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {fields.map((f) => {
        if (!f.bbox) return null;
        const selected = f.key === selectedKey;
        const color =
          f.confidence >= 0.85
            ? "var(--success)"
            : f.confidence >= 0.7
              ? "var(--warning)"
              : "var(--danger)";
        return (
          <button
            key={f.key}
            title={`${f.key} · ${Math.round(f.confidence * 100)}%`}
            aria-label={`${f.key}, ${Math.round(f.confidence * 100)} percent confidence`}
            aria-pressed={selected}
            onClick={() => onSelectField(f.key)}
            style={{
              position: "absolute",
              left: `${f.bbox.x * 100}%`,
              top: `${f.bbox.y * 100}%`,
              width: `${f.bbox.w * 100}%`,
              height: `${f.bbox.h * 100}%`,
              border: `2px solid ${color}`,
              background: selected ? "var(--accent-subtle)" : "transparent",
              boxShadow: selected ? "0 0 0 2px var(--accent)" : "none",
              borderRadius: 2,
              pointerEvents: "auto",
              cursor: "pointer",
              padding: 0,
            }}
          />
        );
      })}
    </div>
  );
}

function PageFrame({ pageNumber }: { pageNumber: number }) {
  return (
    <div
      style={{
        width: PAGE_WIDTH,
        height: Math.round(PAGE_WIDTH / A4_RATIO),
        display: "grid",
        placeItems: "center",
        color: "var(--text-muted)",
        fontSize: "var(--font-size-sm)",
        border: "1px solid var(--border)",
        background: "var(--paper)",
      }}
    >
      Page {pageNumber}
    </div>
  );
}

function ViewerNote({ text }: { text: string }) {
  return (
    <div style={{ padding: "var(--space-6)", color: "var(--text-muted)", textAlign: "center" }}>
      {text}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Document, Page, pdfjs } from "react-pdf";
import type { ExtractedField } from "@/jobs/types";

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
export function DocumentViewer({
  documentId,
  pageCountHint = 4,
  fields,
  selectedKey,
  onSelectField,
}: {
  documentId: string;
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

  return (
    <div
      ref={parentRef}
      style={{
        height: 560,
        overflow: "auto",
        background: "var(--surface-2)",
        borderRadius: "var(--radius-sm)",
      }}
    >
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
                <div style={{ position: "relative", background: "#fff", borderRadius: 2 }}>
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
      </Document>
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
            ? "var(--status-completed)"
            : f.confidence >= 0.7
              ? "var(--status-partial)"
              : "var(--status-failed)";
        return (
          <button
            key={f.key}
            title={`${f.key} · ${Math.round(f.confidence * 100)}%`}
            onClick={() => onSelectField(f.key)}
            style={{
              position: "absolute",
              left: `${f.bbox.x * 100}%`,
              top: `${f.bbox.y * 100}%`,
              width: `${f.bbox.w * 100}%`,
              height: `${f.bbox.h * 100}%`,
              border: `2px solid ${color}`,
              background: selected ? "rgba(79,140,255,0.18)" : "transparent",
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
        color: "#94a3b8",
        fontSize: 13,
        border: "1px solid #e2e8f0",
      }}
    >
      Page {pageNumber}
    </div>
  );
}

function ViewerNote({ text }: { text: string }) {
  return (
    <div style={{ padding: "var(--space-5)", color: "var(--text-muted)", textAlign: "center" }}>
      {text}
    </div>
  );
}

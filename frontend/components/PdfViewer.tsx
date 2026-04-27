"use client";

import { FileText } from "lucide-react";
import type { Paper } from "./Sidebar";

interface PdfViewerProps {
  papers: Paper[];
  activePdfUrl: string | null;
  activePage: number;
}

export default function PdfViewer({
  papers,
  activePdfUrl,
  activePage,
}: PdfViewerProps) {
  const targetPaper = papers.find(
    (p) => p.pdfUrl === activePdfUrl || p.blobUrl === activePdfUrl
  );
  const pdfSrc = activePdfUrl
    ? `${activePdfUrl}#page=${activePage}`
    : null;

  return (
    <div className="flex h-full flex-col bg-[var(--surface)]">
      <div className="border-b border-[var(--border)] bg-[var(--surface-elevated)] p-3">
        <h2 className="text-sm font-semibold text-[var(--foreground)]">PDF Viewer</h2>
        {targetPaper && (
          <p className="truncate text-xs text-[var(--muted)]">{targetPaper.filename}</p>
        )}
      </div>
      <div className="flex flex-1 items-center justify-center overflow-hidden p-4">
        {pdfSrc ? (
          <embed
            src={pdfSrc}
            type="application/pdf"
            className="min-h-0 h-full w-full rounded border border-[var(--border)]"
            title="PDF"
          />
        ) : (
          <div className="text-center text-[var(--muted)]">
            <FileText className="mx-auto mb-2 h-12 w-12 opacity-50" />
            <p className="text-sm">No document selected</p>
            <p className="text-xs mt-1">Upload a PDF to view it here</p>
          </div>
        )}
      </div>
    </div>
  );
}

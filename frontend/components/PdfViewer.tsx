"use client";

import { FileText } from "lucide-react";
import type { Paper } from "./Sidebar";

interface PdfViewerProps {
  papers: Paper[];
  selectedSource: string | null;
  selectedPage: number | null;
}

export default function PdfViewer({
  papers,
  selectedSource,
  selectedPage,
}: PdfViewerProps) {
  const targetPaper = selectedSource
    ? papers.find((p) => p.filename === selectedSource)
    : papers[0];
  const blobUrl = targetPaper?.blobUrl;

  const pdfUrl = blobUrl
    ? `${blobUrl}${selectedPage ? `#page=${selectedPage}` : ""}`
    : null;

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="p-3 border-b border-gray-200 bg-white">
        <h2 className="text-sm font-semibold text-gray-800">PDF Viewer</h2>
        {targetPaper && (
          <p className="text-xs text-gray-500 truncate">{targetPaper.filename}</p>
        )}
      </div>
      <div className="flex-1 overflow-hidden flex items-center justify-center p-4">
        {pdfUrl ? (
          <embed
            src={pdfUrl}
            type="application/pdf"
            className="w-full h-full rounded border border-gray-200"
            title="PDF"
          />
        ) : (
          <div className="text-center text-gray-500">
            <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No document selected</p>
            <p className="text-xs mt-1">Upload a PDF to view it here</p>
          </div>
        )}
      </div>
    </div>
  );
}

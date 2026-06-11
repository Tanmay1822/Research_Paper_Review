"use client";

import { FileUp, FileText, Loader2 } from "lucide-react";
import { useCallback, useState } from "react";
import { uploadPdf } from "@/utils/api";

export interface Paper {
  id: string;
  filename: string;
  title: string | null;
  category: string;
  blobUrl?: string;
  /** Backend-served PDF URL for citation sync */
  pdfUrl?: string;
}

interface SidebarProps {
  papers: Paper[];
  onPapersChange: (papers: Paper[]) => void;
}

export default function Sidebar({ papers, onPapersChange }: SidebarProps) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.type.includes("pdf")) {
        setError("Only PDF files are accepted.");
        return;
      }
      setError(null);
      setUploading(true);
      const blobUrl = URL.createObjectURL(file);
      try {
        const res = await uploadPdf(file);
        onPapersChange([
          ...papers,
          {
            id: res.task_id,
            filename: file.name,
            title: file.name.replace(".pdf", ""),
            category: "Processing",
            blobUrl,
          },
        ]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
        URL.revokeObjectURL(blobUrl);
      } finally {
        setUploading(false);
      }
    },
    [papers, onPapersChange]
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const onDragLeave = () => setDragOver(false);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  return (
    <div className="flex h-full flex-col border-r border-[var(--border)] bg-[var(--surface-elevated)]">
      <div className="border-b border-[var(--border)] p-3">
        <h2 className="text-sm font-semibold text-[var(--foreground)]">Documents</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          className={`
            border-2 border-dashed rounded-lg p-4 text-center transition-colors
            ${dragOver ? "border-[var(--primary)] bg-[var(--accent)]/50" : "border-[var(--border)] hover:border-[var(--primary)]/45"}
          `}
        >
          <input
            type="file"
            accept=".pdf"
            onChange={onInputChange}
            disabled={uploading}
            className="hidden"
            id="pdf-upload"
          />
          <label htmlFor="pdf-upload" className="cursor-pointer block">
            {uploading ? (
              <Loader2 className="mx-auto mb-2 h-8 w-8 animate-spin text-[var(--primary)]" />
            ) : (
              <FileUp className="mx-auto mb-2 h-8 w-8 text-[var(--muted)]" />
            )}
            <p className="text-sm text-[var(--muted)]">
              {uploading ? "Processing…" : "Drop PDF or click to upload"}
            </p>
          </label>
        </div>
        {error && (
          <p className="rounded bg-[var(--danger-bg)] px-2 py-1 text-xs text-[var(--danger)]">{error}</p>
        )}
        <div className="space-y-2">
          {papers.map((p) => (
            <div
              key={p.id}
              className="flex items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2"
            >
              <FileText className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--muted)]" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--foreground)]">
                  {p.title || p.filename}
                </p>
                <p className="text-xs text-[var(--muted)]">{p.category}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

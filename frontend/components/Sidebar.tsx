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
    <div className="flex flex-col h-full bg-white border-r border-gray-200">
      <div className="p-3 border-b border-gray-200">
        <h2 className="text-sm font-semibold text-gray-800">Documents</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          className={`
            border-2 border-dashed rounded-lg p-4 text-center transition-colors
            ${dragOver ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-gray-400"}
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
              <Loader2 className="w-8 h-8 mx-auto text-blue-500 animate-spin mb-2" />
            ) : (
              <FileUp className="w-8 h-8 mx-auto text-gray-500 mb-2" />
            )}
            <p className="text-sm text-gray-600">
              {uploading ? "Processing…" : "Drop PDF or click to upload"}
            </p>
          </label>
        </div>
        {error && (
          <p className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded">{error}</p>
        )}
        <div className="space-y-2">
          {papers.map((p) => (
            <div
              key={p.id}
              className="flex items-start gap-2 p-2 rounded-lg bg-gray-50 border border-gray-100"
            >
              <FileText className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-800 truncate">
                  {p.title || p.filename}
                </p>
                <p className="text-xs text-gray-500">{p.category}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

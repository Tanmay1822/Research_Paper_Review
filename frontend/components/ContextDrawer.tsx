"use client";

import {
  ChevronDown,
  ChevronRight,
  Eye,
  FileText,
  FileUp,
  Folder,
  Loader2,
  Plus,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { fetchFolders, fetchPapers, fetchUploadStatus, uploadPdf } from "@/utils/api";
import type { FolderItem, PaperListItem } from "@/utils/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface PaperWithUrl extends PaperListItem {
  pdfUrl: string;
}

interface ContextDrawerProps {
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  papers: PaperWithUrl[];
  onPapersChange: (papers: PaperWithUrl[]) => void;
  draggedPaperId: string | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onPreviewPaper: (id: string) => void;
}

export default function ContextDrawer({
  selectedIds,
  onSelectionChange,
  papers,
  onPapersChange,
  draggedPaperId,
  onDragStart,
  onDragEnd,
  onPreviewPaper,
}: ContextDrawerProps) {
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [dragOverUpload, setDragOverUpload] = useState(false);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  // Set of expanded folder ids ("root" for the root group)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(["root"]));

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [list, folderList] = await Promise.all([fetchPapers(), fetchFolders()]);
      const withUrl = list.map((p) => ({ ...p, pdfUrl: `${API_BASE}/api/papers/${p.id}/pdf` }));
      onPapersChange(withUrl);
      setFolders(folderList);
    } catch {
      onPapersChange([]);
      setFolders([]);
    } finally {
      setLoading(false);
    }
  }, [onPapersChange]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  };

  const toggleFolder = (id: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleFile = async (file: File) => {
    if (!file.type.includes("pdf")) return;
    setUploading(true);
    setUploadError("");
    try {
      const queued = await uploadPdf(file);
      let resultId: string | null = null;
      for (let i = 0; i < 120; i += 1) {
        const status = await fetchUploadStatus(queued.task_id);
        if (status.status === "completed") {
          resultId = status.result?.id ?? null;
          break;
        }
        if (status.status === "failed") {
          throw new Error(status.user_message || "File processing failed, please try again.");
        }
        await sleep(2000);
      }
      if (!resultId) throw new Error("Processing timed out. Please refresh.");
      await loadData();
      onSelectionChange(new Set([...selectedIds, resultId]));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed, please try again");
    } finally {
      setUploading(false);
    }
  };

  const onDropUpload = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverUpload(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  // Group papers
  const rootPapers = papers.filter((p) => p.folder_id === null);
  const getPapersForFolder = (folderId: string) =>
    papers.filter((p) => p.folder_id === folderId);

  return (
    <aside className="flex w-64 flex-shrink-0 flex-col border-r border-[var(--accent)] bg-[var(--nav-bg)]">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-[var(--border)] px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--nav-fg)]">
          Knowledge Base
        </p>
      </div>

      {/* Folder accordion */}
      <div className="min-h-0 flex-1 overflow-y-auto py-3">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--nav-fg)]" />
          </div>
        ) : (
          <>
            {/* Root folder */}
            <FolderSection
              id="root"
              name="Root"
              papers={rootPapers}
              isExpanded={expandedFolders.has("root")}
              onToggle={() => toggleFolder("root")}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onPreview={onPreviewPaper}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              draggingId={draggedPaperId}
            />

            {/* User folders */}
            {folders.map((folder) => (
              <FolderSection
                key={folder.id}
                id={folder.id}
                name={folder.name}
                papers={getPapersForFolder(folder.id)}
                isExpanded={expandedFolders.has(folder.id)}
                onToggle={() => toggleFolder(folder.id)}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                onPreview={onPreviewPaper}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                draggingId={draggedPaperId}
              />
            ))}
          </>
        )}
      </div>

      {/* Upload zone */}
      <div className="flex-shrink-0 border-t border-[var(--border)] p-3">
        {uploadError && (
          <p className="mb-2 rounded-lg border border-[var(--danger)]/25 bg-[var(--danger-bg)] px-2 py-1.5 text-xs text-[var(--nav-fg)]">
            {uploadError}
          </p>
        )}
        <div
          onDrop={onDropUpload}
          onDragOver={(e) => { e.preventDefault(); setDragOverUpload(true); }}
          onDragLeave={() => setDragOverUpload(false)}
          className={`rounded-xl border-2 border-dashed p-3 text-center transition-colors ${
            dragOverUpload
              ? "border-[var(--cta)] bg-[var(--cta)]/20"
              : "border-[var(--accent)]/70 hover:border-[var(--cta)]"
          }`}
        >
          <input
            type="file"
            accept=".pdf"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            disabled={uploading}
            className="hidden"
            id="sidebar-upload"
          />
          <label htmlFor="sidebar-upload" className="block cursor-pointer">
            {uploading ? (
              <Loader2 className="mx-auto mb-1 h-5 w-5 animate-spin text-[var(--cta)]" />
            ) : (
              <FileUp className="mx-auto mb-1 h-5 w-5 text-[var(--nav-fg)]" />
            )}
            <p className="text-xs text-[var(--nav-fg)]">
              {uploading ? "Processing…" : "Drop PDF to upload"}
            </p>
          </label>
        </div>
      </div>
    </aside>
  );
}

/* ── Folder Section sub-component ── */
interface FolderSectionProps {
  id: string;
  name: string;
  papers: PaperWithUrl[];
  isExpanded: boolean;
  onToggle: () => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onPreview: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  draggingId: string | null;
}

function FolderSection({
  id,
  name,
  papers,
  isExpanded,
  onToggle,
  selectedIds,
  onToggleSelect,
  onPreview,
  onDragStart,
  onDragEnd,
  draggingId,
}: FolderSectionProps) {
  return (
    <div className="mb-1 px-2">
      {/* Folder header row */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left transition-colors hover:bg-[var(--cta)]/20"
      >
        {isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-[var(--nav-fg)]" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-[var(--nav-fg)]" />
        )}
        <Folder className="h-4 w-4 flex-shrink-0 text-[var(--cta)]/80" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--nav-fg)]">{name}</span>
        <span className="flex-shrink-0 text-xs text-[var(--nav-fg)]/80">{papers.length}</span>
      </button>

      {/* Papers list */}
      {isExpanded && (
        <div className="mt-0.5 space-y-0.5 pl-5">
          {papers.length === 0 ? (
            <p className="px-2 py-2 text-xs text-[var(--nav-fg)]/80">No papers</p>
          ) : (
            papers.map((paper) => (
              <PaperItem
                key={paper.id}
                paper={paper}
                isSelected={selectedIds.has(paper.id)}
                isDragging={draggingId === paper.id}
                onToggleSelect={onToggleSelect}
                onPreview={onPreview}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

/* ── Individual Paper Item ── */
interface PaperItemProps {
  paper: PaperWithUrl;
  isSelected: boolean;
  isDragging: boolean;
  onToggleSelect: (id: string) => void;
  onPreview: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
}

function PaperItem({
  paper,
  isSelected,
  isDragging,
  onToggleSelect,
  onPreview,
  onDragStart,
  onDragEnd,
}: PaperItemProps) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("paperId", paper.id);
        onDragStart(paper.id);
      }}
      onDragEnd={onDragEnd}
      className={`group flex cursor-grab items-start gap-2 rounded-xl px-2 py-2 transition-all active:cursor-grabbing ${
        isSelected
          ? "bg-[var(--cta)]/25 ring-1 ring-[var(--cta)]/40"
          : "hover:bg-[var(--cta)]/18"
      } ${isDragging ? "opacity-40" : ""}`}
    >
      <FileText
        className={`mt-0.5 h-4 w-4 flex-shrink-0 ${
          isSelected ? "text-[var(--cta)]" : "text-[var(--nav-fg)] group-hover:text-[var(--cta)]"
        }`}
      />
      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-xs font-medium leading-snug ${
            isSelected ? "text-[var(--nav-fg)]" : "text-[var(--nav-fg)]/85 group-hover:text-[var(--nav-fg)]"
          }`}
          title={paper.title || paper.filename}
        >
          {paper.title || paper.filename}
        </p>
        {paper.category && (
          <p className="mt-0.5 truncate text-[10px] text-[var(--nav-fg)]/75">{paper.category}</p>
        )}
      </div>

      {/* Action buttons (revealed on hover) */}
      <div className="flex flex-shrink-0 flex-col gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        {/* Preview in PDF pane */}
        <button
          type="button"
          title="Preview PDF"
          onClick={(e) => { e.stopPropagation(); onPreview(paper.id); }}
          className="flex h-5 w-5 items-center justify-center rounded-md bg-[var(--cta)]/18 text-[var(--nav-fg)] hover:bg-[var(--cta)]/40 hover:text-[var(--foreground)]"
        >
          <Eye className="h-3 w-3" />
        </button>
        {/* Add / remove from context */}
        <button
          type="button"
          title={isSelected ? "Remove from context" : "Add to context"}
          onClick={(e) => { e.stopPropagation(); onToggleSelect(paper.id); }}
          className={`flex h-5 w-5 items-center justify-center rounded-md transition-colors ${
            isSelected
              ? "bg-[var(--accent)] text-[var(--nav-fg)] hover:bg-[var(--danger-bg)] hover:text-[var(--danger)]"
              : "bg-[var(--cta)]/18 text-[var(--nav-fg)] hover:bg-[var(--cta)]/40 hover:text-[var(--foreground)]"
          }`}
        >
          <Plus className={`h-3 w-3 transition-transform ${isSelected ? "rotate-45" : ""}`} />
        </button>
      </div>
    </div>
  );
}

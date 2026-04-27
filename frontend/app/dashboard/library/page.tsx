"use client";

import {
  ExternalLink,
  FileText,
  Folder,
  FolderPlus,
  Loader2,
  MousePointerClick,
  Pencil,
  Trash2,
  Upload,
  User,
  WandSparkles,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import ErrorAlert from "@/components/ErrorAlert";
import PaperDetailSlideOver from "@/components/PaperDetailSlideOver";
import {
  bulkDeletePapers,
  bulkExtractKnowledgeCards,
  createFolder,
  fetchRelatedPapersOnline,
  deleteFolder,
  fetchFolders,
  fetchPapers,
  fetchUploadStatus,
  movePaper,
  renameFolder,
  uploadPdf,
} from "@/utils/api";
import type { FolderItem, PaperListItem, RelatedOnlinePaper } from "@/utils/api";

export default function LibraryPage() {
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [papers, setPapers] = useState<PaperListItem[]>([]);
  const [activeFolder, setActiveFolder] = useState<string>("root");
  const [selectedPaperIds, setSelectedPaperIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [uploadFolderId, setUploadFolderId] = useState<string>("");
  const [bulkMoveFolderId, setBulkMoveFolderId] = useState<string>("");
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [relatedSource, setRelatedSource] = useState<string>("");
  const [relatedOnlinePapers, setRelatedOnlinePapers] = useState<RelatedOnlinePaper[]>([]);

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [paperData, folderData] = await Promise.all([fetchPapers(), fetchFolders()]);
      setPapers(paperData);
      setFolders(folderData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load workspace");
      setPapers([]);
      setFolders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  const pollUploadTask = useCallback(async (taskId: string) => {
    for (let i = 0; i < 120; i += 1) {
      const status = await fetchUploadStatus(taskId);
      if (status.status === "completed") return;
      if (status.status === "failed") {
        throw new Error(status.user_message || "File processing failed, please try again.");
      }
      await sleep(2000);
    }
    throw new Error("File processing is taking longer than expected. Please refresh in a moment.");
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = "";
    if (files.length === 0) return;
    setUploading(true);
    setError("");
    try {
      const targetFolder = uploadFolderId || (activeFolder === "root" ? null : activeFolder);
      for (const file of files) {
        if (!file.type.includes("pdf")) continue;
        const queued = await uploadPdf(file, targetFolder);
        await pollUploadTask(queued.task_id);
      }
      await loadWorkspace();
      setShowUploadModal(false);
      setSelectedPaperIds(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "File processing failed, please try again");
    } finally {
      setUploading(false);
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    setError("");
    try {
      await createFolder(newFolderName.trim());
      setNewFolderName("");
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create folder.");
    }
  };

  const handleRenameFolder = async (folder: FolderItem) => {
    const nextName = window.prompt("Rename folder", folder.name);
    if (!nextName || nextName.trim() === folder.name) return;
    setError("");
    try {
      await renameFolder(folder.id, nextName.trim());
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename folder.");
    }
  };

  const handleDeleteFolder = async (folder: FolderItem) => {
    if (!window.confirm(`Delete folder "${folder.name}"? Papers will move to Root.`)) return;
    setError("");
    try {
      await deleteFolder(folder.id);
      if (activeFolder === folder.id) setActiveFolder("root");
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete folder.");
    }
  };

  const filteredPapers = papers.filter((paper) =>
    activeFolder === "root" ? paper.folder_id === null : paper.folder_id === activeFolder
  );

  const togglePaper = (paperId: string) => {
    setSelectedPaperIds((prev) => {
      const next = new Set(prev);
      if (next.has(paperId)) next.delete(paperId);
      else next.add(paperId);
      return next;
    });
  };

  const toggleAllVisible = () => {
    const visibleIds = filteredPapers.map((p) => p.id);
    const allSelected = visibleIds.every((id) => selectedPaperIds.has(id));
    setSelectedPaperIds((prev) => {
      const next = new Set(prev);
      if (allSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const selectedIds = Array.from(selectedPaperIds);

  const handleBulkMove = async () => {
    setBulkActionLoading(true);
    setError("");
    try {
      const folderId = bulkMoveFolderId || null;
      await Promise.all(selectedIds.map((paperId) => movePaper(paperId, folderId)));
      setSelectedPaperIds(new Set());
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to move papers.");
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleBulkExtract = async () => {
    setBulkActionLoading(true);
    setError("");
    try {
      await bulkExtractKnowledgeCards(selectedIds);
      setSelectedPaperIds(new Set());
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to trigger extraction.");
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!window.confirm("Delete selected papers permanently?")) return;
    setBulkActionLoading(true);
    setError("");
    try {
      await bulkDeletePapers(selectedIds);
      setSelectedPaperIds(new Set());
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete papers.");
    } finally {
      setBulkActionLoading(false);
    }
  };

  const activeFolderName =
    activeFolder === "root"
      ? "Root"
      : folders.find((f) => f.id === activeFolder)?.name ?? "Folder";

  const targetPaperIdForRelated =
    selectedPaperIds.size === 1 ? Array.from(selectedPaperIds)[0] : selectedPaperId;

  const handleFindRelatedOnline = async () => {
    if (!targetPaperIdForRelated) return;
    setError("");
    setRelatedLoading(true);
    try {
      const payload = await fetchRelatedPapersOnline(targetPaperIdForRelated);
      setRelatedSource(payload.source);
      setRelatedOnlinePapers(payload.papers);
    } catch (err) {
      setRelatedOnlinePapers([]);
      setRelatedSource("");
      setError(err instanceof Error ? err.message : "Failed to fetch related papers.");
    } finally {
      setRelatedLoading(false);
    }
  };

  const onlineAuthors: string[] = relatedOnlinePapers.length > 0
    ? Array.from(new Set(
        relatedOnlinePapers
          .flatMap((p) =>
            p.authors
              ? p.authors.split(/[,;&]/).map((a) => a.trim()).filter((a) => a.length > 1)
              : []
          )
      ))
    : [];

  return (
    <div className="flex h-full flex-col overflow-hidden p-6">
      {error && <ErrorAlert message={error} />}

      {/* ── Two-column grid ── */}
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_280px] gap-6">

        {/* ════════════════════════════════ LEFT MAIN COLUMN ════════════════════════════════ */}
        <div className="min-w-0 space-y-8 overflow-y-auto pr-1">

          {/* ── My Folders ── */}
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">My Folders</h2>
              <div className="flex items-center gap-2">
                <input
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
                  placeholder="New folder name"
                  className="rounded-xl border border-white/5 bg-[#1a2329] px-3 py-1.5 text-sm text-gray-300 placeholder-gray-600 focus:border-yellow-400/30 focus:outline-none focus:ring-1 focus:ring-yellow-400/20"
                  suppressHydrationWarning
                />
                <button
                  type="button"
                  onClick={handleCreateFolder}
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/5 bg-[#1a2329] text-gray-400 transition-colors hover:border-yellow-400/30 hover:text-yellow-400"
                  aria-label="Create folder"
                  suppressHydrationWarning
                >
                  <FolderPlus className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Folder cards */}
            <div className="flex flex-wrap gap-4">
              {/* Root */}
              <button
                type="button"
                onClick={() => setActiveFolder("root")}
                suppressHydrationWarning
                className={`group flex w-44 flex-col rounded-2xl border p-4 text-left transition-all duration-150 ${
                  activeFolder === "root"
                    ? "border-yellow-400/30 bg-yellow-400/10"
                    : "border-white/5 bg-[#1a2329] hover:border-white/10"
                }`}
              >
                <Folder
                  className={`mb-3 h-8 w-8 ${
                    activeFolder === "root" ? "text-yellow-400" : "text-yellow-400/50 group-hover:text-yellow-400/80"
                  }`}
                />
                <p className="text-sm font-semibold text-white">Root</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {papers.filter((p) => !p.folder_id).length} papers
                </p>
              </button>

              {/* User folders */}
              {folders.map((folder) => (
                <div
                  key={folder.id}
                  className={`group relative flex w-44 flex-col rounded-2xl border p-4 transition-all duration-150 ${
                    activeFolder === folder.id
                      ? "border-yellow-400/30 bg-yellow-400/10"
                      : "border-white/5 bg-[#1a2329] hover:border-white/10"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setActiveFolder(folder.id)}
                    className="flex w-full flex-col text-left"
                  >
                    <Folder
                      className={`mb-3 h-8 w-8 ${
                        activeFolder === folder.id
                          ? "text-yellow-400"
                          : "text-yellow-400/50 group-hover:text-yellow-400/80"
                      }`}
                    />
                    <p className="truncate text-sm font-semibold text-white">{folder.name}</p>
                    <p className="mt-0.5 text-xs text-gray-500">{folder.papers_count} papers</p>
                  </button>
                  {/* Hover actions */}
                  <div className="absolute right-2 top-2 hidden gap-1 group-hover:flex">
                    <button
                      type="button"
                      onClick={() => handleRenameFolder(folder)}
                      className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"
                      title="Rename"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteFolder(folder)}
                      className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/5 text-gray-400 hover:bg-red-400/10 hover:text-red-400"
                      title="Delete"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── Recent Papers ── */}
          <section>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Recent Papers</h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  Viewing: <span className="text-gray-400">{activeFolderName}</span>
                </p>
              </div>
              <button
                onClick={() => setShowUploadModal(true)}
                suppressHydrationWarning
                className="inline-flex items-center gap-2 rounded-xl bg-yellow-400 px-4 py-2 text-sm font-semibold text-[#131b20] transition-colors hover:bg-yellow-300"
              >
                <Upload className="h-4 w-4" />
                Upload Papers
              </button>
            </div>

            {/* Bulk actions bar */}
            {selectedPaperIds.size > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-white/5 bg-[#1a2329] px-4 py-3">
                <span className="text-sm font-medium text-gray-300">
                  {selectedPaperIds.size} selected
                </span>
                <select
                  value={bulkMoveFolderId}
                  onChange={(e) => setBulkMoveFolderId(e.target.value)}
                  className="rounded-lg border border-white/5 bg-[#131b20] px-2 py-1.5 text-sm text-gray-300 focus:border-yellow-400/30 focus:outline-none"
                >
                  <option value="">Move to Root</option>
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleBulkMove}
                  disabled={bulkActionLoading}
                  className="rounded-lg border border-white/5 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:bg-white/5 disabled:opacity-50"
                >
                  Move to Folder
                </button>
                <button
                  type="button"
                  onClick={handleBulkExtract}
                  disabled={bulkActionLoading}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-yellow-400/20 bg-yellow-400/10 px-3 py-1.5 text-sm text-yellow-400 transition-colors hover:bg-yellow-400/20 disabled:opacity-50"
                >
                  <WandSparkles className="h-3.5 w-3.5" />
                  Bulk Extract Knowledge Cards
                </button>
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  disabled={bulkActionLoading}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-1.5 text-sm text-red-400 transition-colors hover:bg-red-400/20 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Bulk Delete
                </button>
              </div>
            )}

            {/* Papers list */}
            {loading ? (
              <div className="flex min-h-[200px] flex-col items-center justify-center rounded-2xl border border-white/5 bg-[#1a2329]">
                <Loader2 className="mb-3 h-8 w-8 animate-spin text-yellow-400" />
                <p className="text-sm text-gray-500">Loading workspace…</p>
              </div>
            ) : (
              <div className="rounded-2xl border border-white/5 bg-[#1a2329] overflow-hidden">
                {/* Table header */}
                <div className="flex items-center gap-4 border-b border-white/5 px-4 py-3">
                  <div
                    className="flex-shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-white/20 bg-transparent accent-yellow-400"
                      checked={
                        filteredPapers.length > 0 &&
                        filteredPapers.every((p) => selectedPaperIds.has(p.id))
                      }
                      onChange={toggleAllVisible}
                    />
                  </div>
                  <span className="flex-1 text-xs font-semibold uppercase tracking-wider text-gray-600">
                    Title
                  </span>
                  <span className="w-28 text-xs font-semibold uppercase tracking-wider text-gray-600">
                    Category
                  </span>
                  <span className="w-24 text-xs font-semibold uppercase tracking-wider text-gray-600">
                    Status
                  </span>
                </div>

                {/* Rows */}
                {filteredPapers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <FileText className="mb-3 h-10 w-10 text-gray-700" />
                    <p className="text-sm text-gray-600">No papers in this folder.</p>
                    <button
                      onClick={() => setShowUploadModal(true)}
                      className="mt-3 text-sm text-yellow-400 hover:underline"
                    >
                      Upload your first paper →
                    </button>
                  </div>
                ) : (
                  filteredPapers.map((paper, idx) => (
                    <div
                      key={paper.id}
                      className={`group flex cursor-pointer items-center gap-4 px-4 py-3.5 transition-colors hover:bg-white/[0.03] ${
                        idx !== filteredPapers.length - 1 ? "border-b border-white/5" : ""
                      }`}
                      onClick={() => setSelectedPaperId(paper.id)}
                    >
                      <div
                        className="flex-shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePaper(paper.id);
                        }}
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-white/20 bg-transparent accent-yellow-400"
                          checked={selectedPaperIds.has(paper.id)}
                          onChange={() => togglePaper(paper.id)}
                        />
                      </div>
                      <FileText className="h-8 w-8 flex-shrink-0 text-yellow-400/40 group-hover:text-yellow-400/60 transition-colors" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-white">
                          {paper.title || paper.filename}
                        </p>
                        <p className="truncate text-xs text-gray-600">{paper.filename}</p>
                      </div>
                      <div className="w-28">
                        {paper.category ? (
                          <span className="inline-flex rounded-lg bg-white/5 px-2.5 py-1 text-xs font-medium text-gray-400">
                            {paper.category}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-700">—</span>
                        )}
                      </div>
                      <div className="w-24">
                        <span
                          className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-medium ${
                            paper.status === "completed"
                              ? "bg-green-500/10 text-green-400"
                              : paper.status === "failed"
                                ? "bg-red-500/10 text-red-400"
                                : "bg-amber-500/10 text-amber-400"
                          }`}
                        >
                          {paper.status}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </section>
        </div>

        {/* ════════════════════════════════ RIGHT SIDEBAR ════════════════════════════════ */}
        <aside className="space-y-6 overflow-y-auto">

          {/* ── Popular Papers (related by category) ── */}
          <div className="rounded-2xl border border-white/5 bg-[#1a2329] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Related Papers</h3>
              <button
                type="button"
                onClick={handleFindRelatedOnline}
                disabled={!targetPaperIdForRelated || relatedLoading}
                className="inline-flex items-center gap-1 rounded-lg border border-yellow-400/20 bg-yellow-400/10 px-2 py-1 text-xs text-yellow-400 transition-colors hover:bg-yellow-400/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {relatedLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <WandSparkles className="h-3 w-3" />}
                Find Online
              </button>
            </div>

            {/* No paper selected yet */}
            {!targetPaperIdForRelated && (
              <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                <MousePointerClick className="h-8 w-8 text-gray-700" />
                <p className="text-xs text-gray-600">Select a paper, then click Find Online</p>
              </div>
            )}

            {/* Loading */}
            {targetPaperIdForRelated && relatedLoading && (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3 animate-pulse">
                    <div className="h-10 w-8 flex-shrink-0 rounded-lg bg-white/5" />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="h-2.5 w-3/4 rounded-full bg-white/5" />
                      <div className="h-2 w-1/2 rounded-full bg-white/[0.03]" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Results */}
            {targetPaperIdForRelated && !relatedLoading && relatedOnlinePapers.length > 0 && (
              <div className="space-y-2">
                {!!relatedSource && (
                  <p className="mb-2 text-[10px] uppercase tracking-wide text-gray-600">
                    Source: {relatedSource}
                  </p>
                )}
                {relatedOnlinePapers.map((p, idx) => (
                  <div
                    key={`${p.title}-${idx}`}
                    className="flex w-full items-start gap-3 rounded-xl p-2 text-left transition-colors hover:bg-white/5"
                  >
                    <div className="flex h-10 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-yellow-400/10">
                      <FileText className="h-4 w-4 text-yellow-400/70" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-xs font-medium text-gray-300">{p.title}</p>
                      <p className="mt-0.5 line-clamp-1 text-xs text-gray-600">{p.authors}</p>
                      <div className="mt-1 flex items-center gap-1.5">
                        {p.year && (
                          <span className="inline-flex rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-gray-500">
                            {p.year}
                          </span>
                        )}
                        {p.venue && (
                          <span className="inline-flex max-w-[120px] truncate rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-gray-500">
                            {p.venue}
                          </span>
                        )}
                        {p.url && (
                          <a
                            href={p.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] text-yellow-400 hover:underline"
                          >
                            Open <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* No related papers found */}
            {targetPaperIdForRelated && !relatedLoading && relatedOnlinePapers.length === 0 && (
              <div className="py-6 text-center">
                <p className="text-xs text-gray-600">No internet results yet. Click Find Online to fetch.</p>
              </div>
            )}
          </div>

          {/* ── Authors from search results ── */}
          <div className="rounded-2xl border border-white/5 bg-[#1a2329] p-5">
            <h3 className="mb-4 text-sm font-semibold text-white">Authors</h3>

            {/* No paper selected */}
            {!targetPaperIdForRelated && (
              <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                <MousePointerClick className="h-8 w-8 text-gray-700" />
                <p className="text-xs text-gray-600">Select a paper, then click Find Online</p>
              </div>
            )}

            {/* Loading */}
            {targetPaperIdForRelated && relatedLoading && (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3 animate-pulse">
                    <div className="h-9 w-9 flex-shrink-0 rounded-full bg-white/5" />
                    <div className="h-2.5 w-2/3 rounded-full bg-white/5" />
                  </div>
                ))}
              </div>
            )}

            {/* Authors found */}
            {targetPaperIdForRelated && !relatedLoading && onlineAuthors.length > 0 && (
              <div className="space-y-1">
                {onlineAuthors.map((author, idx) => {
                  const initials = author
                    .split(" ")
                    .filter(Boolean)
                    .map((w) => w[0].toUpperCase())
                    .slice(0, 2)
                    .join("");
                  const colors = [
                    "bg-yellow-400/20 text-yellow-400",
                    "bg-blue-400/20 text-blue-400",
                    "bg-green-400/20 text-green-400",
                    "bg-purple-400/20 text-purple-400",
                    "bg-pink-400/20 text-pink-400",
                  ];
                  return (
                    <div key={idx} className="flex items-center gap-3 rounded-xl px-2 py-1.5">
                      <div
                        className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold ${colors[idx % colors.length]}`}
                      >
                        {initials || <User className="h-4 w-4" />}
                      </div>
                      <p className="truncate text-xs font-medium text-gray-300">{author}</p>
                    </div>
                  );
                })}
              </div>
            )}

            {/* No results yet */}
            {targetPaperIdForRelated && !relatedLoading && onlineAuthors.length === 0 && (
              <div className="py-6 text-center">
                <p className="text-xs text-gray-600">No internet results yet. Click Find Online to fetch.</p>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* ── Upload Modal ── */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/5 bg-[#1a2329] p-6 shadow-2xl">
            <h2 className="mb-5 text-lg font-semibold text-white">Bulk Upload PDFs</h2>
            <div className="mb-4">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-600">
                Destination folder
              </label>
              <select
                value={uploadFolderId}
                onChange={(e) => setUploadFolderId(e.target.value)}
                className="w-full rounded-xl border border-white/5 bg-[#131b20] px-3 py-2 text-sm text-gray-300 focus:border-yellow-400/30 focus:outline-none"
              >
                <option value="">Root</option>
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-white/10 p-10 transition-colors hover:border-yellow-400/40 hover:bg-yellow-400/5">
              <input
                type="file"
                accept=".pdf"
                multiple
                onChange={handleFileSelect}
                disabled={uploading}
                className="hidden"
              />
              {uploading ? (
                <Loader2 className="mb-3 h-12 w-12 animate-spin text-yellow-400" />
              ) : (
                <Upload className="mb-3 h-12 w-12 text-gray-600" />
              )}
              <p className="text-sm font-medium text-gray-400">
                {uploading ? "Processing uploads…" : "Click to select one or more PDF files"}
              </p>
            </label>
            <button
              onClick={() => !uploading && setShowUploadModal(false)}
              disabled={uploading}
              className="mt-4 w-full rounded-xl border border-white/5 py-2.5 text-sm text-gray-400 transition-colors hover:bg-white/5 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Paper Detail Slide Over ── */}
      <PaperDetailSlideOver
        paperId={selectedPaperId}
        onClose={() => setSelectedPaperId(null)}
      />
    </div>
  );
}

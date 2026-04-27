"use client";

import {
  BookOpen,
  CheckCircle,
  Circle,
  ExternalLink,
  FileText,
  Folder,
  FolderPlus,
  Loader2,
  MousePointerClick,
  Pencil,
  Search,
  Tag,
  Trash2,
  Upload,
  User,
  WandSparkles,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
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
  semanticSearch,
  updateReadingStatus,
  updateTags,
  uploadPdf,
} from "@/utils/api";
import type { FolderItem, PaperListItem, ReadingStatus, RelatedOnlinePaper, SemanticSearchResult } from "@/utils/api";

const READING_STATUS_CONFIG: Record<ReadingStatus, { label: string; color: string }> = {
  to_read: { label: "To Read", color: "text-[var(--card-fg)] border-[var(--accent)] bg-[var(--card-bg)]" },
  reading: { label: "Reading", color: "text-[var(--foreground)] border-[var(--cta)] bg-[var(--cta)]/70" },
  done: { label: "Done", color: "text-[var(--foreground)] border-[var(--success)]/35 bg-[var(--success-bg)]" },
};

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

  // Semantic Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SemanticSearchResult[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tag edit state
  const [editingTagsFor, setEditingTagsFor] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");

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

  const handleSemanticSearch = useCallback((query: string) => {
    setSearchQuery(query);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!query.trim()) { setSearchResults(null); return; }
    searchTimeout.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const results = await semanticSearch(query.trim(), 10);
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 600);
  }, []);

  const handleReadingStatus = async (paperId: string, status: ReadingStatus | null) => {
    try {
      await updateReadingStatus(paperId, status);
      setPapers((prev) => prev.map((p) => p.id === paperId ? { ...p, reading_status: status } : p));
    } catch { /* silent */ }
  };

  const handleAddTag = async (paperId: string, paper: PaperListItem) => {
    const tag = tagInput.trim();
    if (!tag || paper.tags.includes(tag)) return;
    const next = [...paper.tags, tag].slice(0, 10);
    try {
      await updateTags(paperId, next);
      setPapers((prev) => prev.map((p) => p.id === paperId ? { ...p, tags: next } : p));
      setTagInput("");
    } catch { /* silent */ }
  };

  const handleRemoveTag = async (paperId: string, paper: PaperListItem, tag: string) => {
    const next = paper.tags.filter((t) => t !== tag);
    try {
      await updateTags(paperId, next);
      setPapers((prev) => prev.map((p) => p.id === paperId ? { ...p, tags: next } : p));
    } catch { /* silent */ }
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
              <h2 className="text-lg font-semibold text-[var(--foreground)]">My Folders</h2>
              <div className="flex items-center gap-2">
                <input
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
                  placeholder="New folder name"
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-1.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:border-[var(--cta)]/35 focus:outline-none focus:ring-1 focus:ring-[var(--cta)]/20"
                  suppressHydrationWarning
                />
                <button
                  type="button"
                  onClick={handleCreateFolder}
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--muted)] transition-colors hover:border-[var(--cta)]/35 hover:text-[var(--cta)]"
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
                    ? "border-[var(--accent)] bg-[var(--card-bg)]"
                    : "border-[var(--border)] bg-[var(--card-bg)] hover:border-[var(--accent)]"
                }`}
              >
                <Folder
                  className={`mb-3 h-8 w-8 ${
                    activeFolder === "root" ? "text-[var(--cta)]" : "text-[var(--cta)]/75 group-hover:text-[var(--cta)]"
                  }`}
                />
                <p className="text-sm font-semibold text-[var(--card-fg)]">Root</p>
                <p className="mt-0.5 text-xs text-[var(--nav-fg)]/80">
                  {papers.filter((p) => !p.folder_id).length} papers
                </p>
              </button>

              {/* User folders */}
              {folders.map((folder) => (
                <div
                  key={folder.id}
                  className={`group relative flex w-44 flex-col rounded-2xl border p-4 transition-all duration-150 ${
                    activeFolder === folder.id
                      ? "border-[var(--accent)] bg-[var(--card-bg)]"
                      : "border-[var(--border)] bg-[var(--card-bg)] hover:border-[var(--accent)]"
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
                          ? "text-[var(--cta)]"
                          : "text-[var(--cta)]/55 group-hover:text-[var(--cta)]/80"
                      }`}
                    />
                    <p className="truncate text-sm font-semibold text-[var(--card-fg)]">{folder.name}</p>
                    <p className="mt-0.5 text-xs text-[var(--nav-fg)]/80">{folder.papers_count} papers</p>
                  </button>
                  {/* Hover actions */}
                  <div className="absolute right-2 top-2 hidden gap-1 group-hover:flex">
                    <button
                      type="button"
                      onClick={() => handleRenameFolder(folder)}
                      className="flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--cta)]/15 text-[var(--nav-fg)] hover:bg-[var(--cta)]/40 hover:text-[var(--foreground)]"
                      title="Rename"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteFolder(folder)}
                      className="flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--cta)]/15 text-[var(--nav-fg)] hover:bg-[var(--danger-bg)] hover:text-[var(--danger)]"
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
                <h2 className="text-lg font-semibold text-[var(--foreground)]">Recent Papers</h2>
                <p className="mt-0.5 text-xs text-[var(--muted)]">
                  Viewing: <span className="text-[var(--foreground)]">{activeFolderName}</span>
                </p>
              </div>
              <button
                onClick={() => setShowUploadModal(true)}
                suppressHydrationWarning
                className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--primary-hover)]"
              >
                <Upload className="h-4 w-4" />
                Upload Papers
              </button>
            </div>

            {/* Bulk actions bar */}
            {selectedPaperIds.size > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-3">
                <span className="text-sm font-medium text-[var(--foreground)]">
                  {selectedPaperIds.size} selected
                </span>
                <select
                  value={bulkMoveFolderId}
                  onChange={(e) => setBulkMoveFolderId(e.target.value)}
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--foreground)] focus:border-[var(--cta)]/30 focus:outline-none"
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
                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--foreground)] transition-colors hover:bg-[var(--surface)] disabled:opacity-50"
                >
                  Move to Folder
                </button>
                <button
                  type="button"
                  onClick={handleBulkExtract}
                  disabled={bulkActionLoading}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--primary)]/45 bg-[var(--primary)] px-3 py-1.5 text-sm text-[var(--foreground)] transition-colors hover:bg-[var(--primary-hover)] disabled:opacity-50"
                >
                  <WandSparkles className="h-3.5 w-3.5" />
                  Bulk Extract Knowledge Cards
                </button>
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  disabled={bulkActionLoading}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-[var(--danger)]/30 bg-[var(--danger-bg)] px-3 py-1.5 text-sm text-[var(--danger)] transition-colors hover:bg-[var(--danger)]/20 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Bulk Delete
                </button>
              </div>
            )}

            {/* ── Semantic Search Bar ── */}
            <div className="mb-4 relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
              {searchLoading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[var(--primary)]/70" />}
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSemanticSearch(e.target.value)}
                placeholder="Semantic search across all papers…"
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] py-2.5 pl-9 pr-10 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:border-[var(--cta)]/35 focus:outline-none focus:ring-1 focus:ring-[var(--cta)]/20"
                suppressHydrationWarning
              />
              {searchQuery && (
                <button type="button" onClick={() => { setSearchQuery(""); setSearchResults(null); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--foreground)]">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* ── Semantic Search Results ── */}
            {searchResults !== null && (
              <div className="mb-4 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)] shadow-sm">
                <div className="border-b border-[var(--border)] px-4 py-2.5">
                  <p className="text-xs font-semibold text-[var(--muted)]">
                    {searchResults.length === 0 ? "No results found" : `${searchResults.length} semantic results for "${searchQuery}"`}
                  </p>
                </div>
                {searchResults.map((r, i) => (
                  <div key={i} onClick={() => setSelectedPaperId(r.paper_id)}
                    className="group flex cursor-pointer items-start gap-3 border-b border-[var(--border)] px-4 py-3 last:border-0 hover:bg-[var(--surface)]">
                    <FileText className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--cta)]/70" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--foreground)]">{r.title || r.filename}</p>
                      <p className="mt-0.5 text-[10px] text-[var(--muted)]">Page {r.page_num}</p>
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--muted)]">{r.excerpt}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Papers list */}
            {loading ? (
              <div className="flex min-h-[200px] flex-col items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)]">
                <Loader2 className="mb-3 h-8 w-8 animate-spin text-[var(--primary)]" />
                <p className="text-sm text-[var(--muted)]">Loading workspace…</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)] shadow-sm">
                {/* Table header */}
                <div className="flex items-center gap-4 border-b border-[var(--border)] bg-[var(--table-header)] px-4 py-3">
                  <div
                    className="flex-shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-[var(--border)] bg-transparent accent-[var(--primary)]"
                      checked={
                        filteredPapers.length > 0 &&
                        filteredPapers.every((p) => selectedPaperIds.has(p.id))
                      }
                      onChange={toggleAllVisible}
                    />
                  </div>
                  <span className="flex-1 text-xs font-semibold uppercase tracking-wider text-[var(--nav-fg)]">
                    Title
                  </span>
                  <span className="w-28 text-xs font-semibold uppercase tracking-wider text-[var(--nav-fg)]">
                    Category
                  </span>
                  <span className="w-24 text-xs font-semibold uppercase tracking-wider text-[var(--nav-fg)]">
                    Status
                  </span>
                  <span className="w-28 text-xs font-semibold uppercase tracking-wider text-[var(--nav-fg)]">
                    Progress
                  </span>
                </div>

                {/* Rows */}
                {filteredPapers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <FileText className="mb-3 h-10 w-10 text-[var(--muted)]" />
                    <p className="text-sm text-[var(--muted)]">No papers in this folder.</p>
                    <button
                      onClick={() => setShowUploadModal(true)}
                      className="mt-3 text-sm text-[var(--cta)] hover:underline"
                    >
                      Upload your first paper →
                    </button>
                  </div>
                ) : (
                  filteredPapers.map((paper, idx) => (
                    <div key={paper.id}>
                    <div
                      className={`group flex cursor-pointer items-center gap-4 px-4 py-3.5 transition-colors hover:bg-[var(--surface)] ${
                        idx !== filteredPapers.length - 1 || paper.tags.length > 0 || editingTagsFor === paper.id ? "border-b border-[var(--border)]" : ""
                      }`}
                      onClick={() => setSelectedPaperId(paper.id)}
                    >
                      <div
                        className="flex-shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-[var(--border)] bg-transparent accent-[var(--primary)]"
                          checked={selectedPaperIds.has(paper.id)}
                          onChange={() => togglePaper(paper.id)}
                        />
                      </div>
                      <FileText className="h-8 w-8 flex-shrink-0 text-[var(--cta)]/55 transition-colors group-hover:text-[var(--cta)]" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[var(--foreground)]">
                          {paper.title || paper.filename}
                        </p>
                        <p className="truncate text-xs text-[var(--muted)]">{paper.filename}</p>
                      </div>
                      <div className="w-28">
                        {paper.category ? (
                          <span className="inline-flex rounded-lg bg-[var(--surface)] px-2.5 py-1 text-xs font-medium text-[var(--muted)]">
                            {paper.category}
                          </span>
                        ) : (
                          <span className="text-xs text-[var(--muted)]">—</span>
                        )}
                      </div>
                      <div className="w-24">
                        <span
                          className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-medium ${
                            paper.status === "completed"
                              ? "bg-[var(--success-bg)] text-[var(--success)]"
                              : paper.status === "failed"
                                ? "bg-[var(--danger-bg)] text-[var(--danger)]"
                                : "bg-[var(--primary)]/45 text-[var(--foreground)]"
                          }`}
                        >
                          {paper.status}
                        </span>
                      </div>
                      {/* Reading status cycling button */}
                      <div className="w-28" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => {
                            const cycle: (ReadingStatus | null)[] = [null, "to_read", "reading", "done"];
                            const cur = cycle.indexOf(paper.reading_status as ReadingStatus | null);
                            handleReadingStatus(paper.id, cycle[(cur + 1) % cycle.length]);
                          }}
                          className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-medium transition-all ${
                            paper.reading_status
                              ? READING_STATUS_CONFIG[paper.reading_status as ReadingStatus].color
                              : "border-[var(--border)] bg-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
                          }`}
                        >
                          {paper.reading_status === "done" ? (
                            <CheckCircle className="h-3 w-3" />
                          ) : paper.reading_status === "reading" ? (
                            <BookOpen className="h-3 w-3" />
                          ) : (
                            <Circle className="h-3 w-3" />
                          )}
                          {paper.reading_status
                            ? READING_STATUS_CONFIG[paper.reading_status as ReadingStatus].label
                            : "—"}
                        </button>
                      </div>
                    </div>
                    {/* Tags row */}
                    {(paper.tags.length > 0 || editingTagsFor === paper.id) && (
                      <div className="flex flex-wrap items-center gap-1.5 pb-2 pl-[72px]" onClick={(e) => e.stopPropagation()}>
                        {paper.tags.map((tag) => (
                          <span key={tag} className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[10px] text-[var(--muted)]">
                            {tag}
                            <button type="button" onClick={() => handleRemoveTag(paper.id, paper, tag)} className="text-[var(--muted)] hover:text-[var(--danger)]">
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </span>
                        ))}
                        {editingTagsFor === paper.id ? (
                          <input
                            autoFocus
                            type="text"
                            value={tagInput}
                            onChange={(e) => setTagInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleAddTag(paper.id, paper);
                              if (e.key === "Escape") setEditingTagsFor(null);
                            }}
                            onBlur={() => setEditingTagsFor(null)}
                            placeholder="Add tag…"
                            className="w-24 rounded-md border border-[var(--cta)]/30 bg-[var(--surface)] px-2 py-0.5 text-[10px] text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none"
                          />
                        ) : (
                          <button type="button" onClick={() => { setEditingTagsFor(paper.id); setTagInput(""); }}
                            className="inline-flex items-center gap-1 rounded-md border border-dashed border-[var(--border)] px-2 py-0.5 text-[10px] text-[var(--muted)] hover:border-[var(--cta)]/35 hover:text-[var(--cta)]">
                            <Tag className="h-2.5 w-2.5" /> tag
                          </button>
                        )}
                      </div>
                    )}
                    {paper.tags.length === 0 && editingTagsFor !== paper.id && (
                      <div className="pl-[72px] pb-0" onClick={(e) => e.stopPropagation()}>
                        <button type="button" onClick={() => { setEditingTagsFor(paper.id); setTagInput(""); }}
                          className="hidden group-hover:inline-flex items-center gap-1 rounded-md border border-dashed border-[var(--border)] px-2 py-0.5 text-[10px] text-[var(--muted)] hover:border-[var(--cta)]/35 hover:text-[var(--cta)]">
                          <Tag className="h-2.5 w-2.5" /> add tag
                        </button>
                      </div>
                    )}
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
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--foreground)]">Related Papers</h3>
              <button
                type="button"
                onClick={handleFindRelatedOnline}
                disabled={!targetPaperIdForRelated || relatedLoading}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--primary)]/45 bg-[var(--primary)] px-2 py-1 text-xs text-[var(--foreground)] transition-colors hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {relatedLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <WandSparkles className="h-3 w-3" />}
                Find Online
              </button>
            </div>

            {/* No paper selected yet */}
            {!targetPaperIdForRelated && (
              <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                <MousePointerClick className="h-8 w-8 text-[var(--muted)]" />
                <p className="text-xs text-[var(--muted)]">Select a paper, then click Find Online</p>
              </div>
            )}

            {/* Loading */}
            {targetPaperIdForRelated && relatedLoading && (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-3 animate-pulse">
                    <div className="h-10 w-8 flex-shrink-0 rounded-lg bg-[var(--surface)]" />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="h-2.5 w-3/4 rounded-full bg-[var(--surface)]" />
                      <div className="h-2 w-1/2 rounded-full bg-[var(--surface-soft)]" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Results */}
            {targetPaperIdForRelated && !relatedLoading && relatedOnlinePapers.length > 0 && (
              <div className="space-y-2">
                {!!relatedSource && (
                  <p className="mb-2 text-[10px] uppercase tracking-wide text-[var(--muted)]">
                    Source: {relatedSource}
                  </p>
                )}
                {relatedOnlinePapers.map((p, idx) => (
                  <div
                    key={`${p.title}-${idx}`}
                    className="flex w-full items-start gap-3 rounded-xl p-2 text-left transition-colors hover:bg-[var(--surface)]"
                  >
                    <div className="flex h-10 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--accent)]/65">
                      <FileText className="h-4 w-4 text-[var(--cta)]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-xs font-medium text-[var(--foreground)]">{p.title}</p>
                      <p className="mt-0.5 line-clamp-1 text-xs text-[var(--muted)]">{p.authors}</p>
                      <div className="mt-1 flex items-center gap-1.5">
                        {p.year && (
                          <span className="inline-flex rounded bg-[var(--surface)] px-1.5 py-0.5 text-[10px] text-[var(--muted)]">
                            {p.year}
                          </span>
                        )}
                        {p.venue && (
                          <span className="inline-flex max-w-[120px] truncate rounded bg-[var(--surface)] px-1.5 py-0.5 text-[10px] text-[var(--muted)]">
                            {p.venue}
                          </span>
                        )}
                        {p.url && (
                          <a
                            href={p.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] text-[var(--cta)] hover:underline"
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
                <p className="text-xs text-[var(--muted)]">No internet results yet. Click Find Online to fetch.</p>
              </div>
            )}
          </div>

          {/* ── Authors from search results ── */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold text-[var(--foreground)]">Authors</h3>

            {/* No paper selected */}
            {!targetPaperIdForRelated && (
              <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                <MousePointerClick className="h-8 w-8 text-[var(--muted)]" />
                <p className="text-xs text-[var(--muted)]">Select a paper, then click Find Online</p>
              </div>
            )}

            {/* Loading */}
            {targetPaperIdForRelated && relatedLoading && (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3 animate-pulse">
                    <div className="h-9 w-9 flex-shrink-0 rounded-full bg-[var(--surface)]" />
                    <div className="h-2.5 w-2/3 rounded-full bg-[var(--surface)]" />
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
                    "bg-[var(--accent)]/70 text-[var(--cta)]",
                    "bg-[var(--surface)] text-[var(--foreground)]",
                    "bg-[var(--accent)]/50 text-[var(--foreground)]",
                    "bg-[var(--surface-soft)] text-[var(--muted)]",
                    "bg-[var(--accent)]/60 text-[var(--cta)]",
                  ];
                  return (
                    <div key={idx} className="flex items-center gap-3 rounded-xl px-2 py-1.5">
                      <div
                        className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold ${colors[idx % colors.length]}`}
                      >
                        {initials || <User className="h-4 w-4" />}
                      </div>
                      <p className="truncate text-xs font-medium text-[var(--foreground)]">{author}</p>
                    </div>
                  );
                })}
              </div>
            )}

            {/* No results yet */}
            {targetPaperIdForRelated && !relatedLoading && onlineAuthors.length === 0 && (
              <div className="py-6 text-center">
                <p className="text-xs text-[var(--muted)]">No internet results yet. Click Find Online to fetch.</p>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* ── Upload Modal ── */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(60,53,47,0.25)] p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)] p-6 shadow-2xl">
            <h2 className="mb-5 text-lg font-semibold text-[var(--foreground)]">Bulk Upload PDFs</h2>
            <div className="mb-4">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                Destination folder
              </label>
              <select
                value={uploadFolderId}
                onChange={(e) => setUploadFolderId(e.target.value)}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-[var(--cta)]/35 focus:outline-none"
              >
                <option value="">Root</option>
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--border)] p-10 transition-colors hover:border-[var(--cta)]/45 hover:bg-[var(--accent)]/40">
              <input
                type="file"
                accept=".pdf"
                multiple
                onChange={handleFileSelect}
                disabled={uploading}
                className="hidden"
              />
              {uploading ? (
                <Loader2 className="mb-3 h-12 w-12 animate-spin text-[var(--primary)]" />
              ) : (
                <Upload className="mb-3 h-12 w-12 text-[var(--muted)]" />
              )}
              <p className="text-sm font-medium text-[var(--muted)]">
                {uploading ? "Processing uploads…" : "Click to select one or more PDF files"}
              </p>
            </label>
            <button
              onClick={() => !uploading && setShowUploadModal(false)}
              disabled={uploading}
              className="mt-4 w-full rounded-xl border border-[var(--border)] py-2.5 text-sm text-[var(--muted)] transition-colors hover:bg-[var(--surface)] disabled:opacity-50"
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

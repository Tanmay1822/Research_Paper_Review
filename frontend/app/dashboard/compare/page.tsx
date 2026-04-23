"use client";

import {
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  Loader2,
  Scale,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import ErrorAlert from "@/components/ErrorAlert";
import { analyzeContradictions, fetchFolders, fetchPapers } from "@/utils/api";
import type {
  ContradictionItem,
  ContradictionReportResponse,
  FolderItem,
  PaperListItem,
} from "@/utils/api";

const MIN_PAPERS = 2;
const MAX_PAPERS = 3;

export default function ComparePapersPage() {
  const [papers, setPapers] = useState<PaperListItem[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set(["root"])
  );
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<ContradictionReportResponse | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setError("");
    Promise.all([fetchPapers(), fetchFolders()])
      .then(([paperList, folderList]) => {
        setPapers(paperList);
        setFolders(folderList);
      })
      .catch((err) => {
        setError(
          err instanceof Error ? err.message : "Unable to load your papers right now."
        );
      })
      .finally(() => setLoading(false));
  }, []);

  const togglePaper = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_PAPERS) next.add(id);
      return next;
    });
    setResult(null);
    setError("");
  }, []);

  const toggleFolder = (id: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runAnalysis = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length < MIN_PAPERS || ids.length > MAX_PAPERS) return;
    setAnalyzing(true);
    setError("");
    setResult(null);
    setIsPanelOpen(true);
    try {
      const report = await analyzeContradictions(ids);
      setResult(report);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed. Please try again.");
    } finally {
      setAnalyzing(false);
    }
  };

  const selectedCount = selectedIds.size;
  const canRun = selectedCount >= MIN_PAPERS && selectedCount <= MAX_PAPERS;

  const rootPapers = papers.filter((p) => p.folder_id === null);
  const getPapersForFolder = (folderId: string) =>
    papers.filter((p) => p.folder_id === folderId);

  return (
    <div className="relative flex min-h-0 flex-1 overflow-hidden bg-gradient-to-br from-slate-900 via-[#0d1b26] to-[#0f1f1a]">
      {/* Ambient glow orbs */}
      <div className="pointer-events-none absolute -left-40 -top-40 h-96 w-96 rounded-full bg-yellow-400/5 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-1/3 h-64 w-64 rounded-full bg-teal-500/5 blur-3xl" />

      {/* ══════════════ LEFT: Paper Selection ══════════════ */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-6">
        {/* Header */}
        <div className="mb-6 flex flex-shrink-0 items-center gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-yellow-400/10 ring-1 ring-yellow-400/20">
            <Scale className="h-5 w-5 text-yellow-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-white">
              Compare Papers
            </h1>
            <p className="mt-0.5 text-xs text-gray-500">
              Select {MIN_PAPERS}–{MAX_PAPERS} papers to analyze agreements and
              contradictions
            </p>
          </div>
          {selectedCount > 0 && (
            <span className="ml-auto rounded-lg border border-yellow-400/20 bg-yellow-400/10 px-3 py-1 text-xs font-medium text-yellow-300">
              {selectedCount} / {MAX_PAPERS} selected
            </span>
          )}
        </div>

        {/* Folder accordion */}
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-yellow-400/50" />
            </div>
          ) : papers.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 py-20 text-center">
              <FileText className="mb-3 h-8 w-8 text-gray-700" />
              <p className="text-sm text-gray-500">No papers in your library.</p>
              <p className="mt-1 text-xs text-gray-700">
                Upload papers from the Chat Workspace to get started.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <FolderSection
                id="root"
                name="Root"
                papers={rootPapers}
                isExpanded={expandedFolders.has("root")}
                onToggle={() => toggleFolder("root")}
                selectedIds={selectedIds}
                onTogglePaper={togglePaper}
                maxReached={selectedCount >= MAX_PAPERS}
              />
              {folders.map((folder) => (
                <FolderSection
                  key={folder.id}
                  id={folder.id}
                  name={folder.name}
                  papers={getPapersForFolder(folder.id)}
                  isExpanded={expandedFolders.has(folder.id)}
                  onToggle={() => toggleFolder(folder.id)}
                  selectedIds={selectedIds}
                  onTogglePaper={togglePaper}
                  maxReached={selectedCount >= MAX_PAPERS}
                />
              ))}
            </div>
          )}
        </div>

        {/* Run button */}
        <div className="mt-5 flex-shrink-0 space-y-3">
          {error && !isPanelOpen && <ErrorAlert message={error} />}
          <button
            onClick={runAnalysis}
            disabled={!canRun || analyzing}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-yellow-400 px-6 py-3 text-sm font-semibold text-[#131b20] shadow-[0_0_20px_rgba(250,204,21,0.2)] transition-all hover:bg-yellow-300 hover:shadow-[0_0_28px_rgba(250,204,21,0.35)] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          >
            {analyzing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Running Deep Comparison…
              </>
            ) : (
              <>
                <Scale className="h-4 w-4" />
                Run Deep Comparison
              </>
            )}
          </button>
        </div>
      </div>

      {/* ══════════════ RIGHT: Sliding Results Panel ══════════════ */}
      <div
        className={`flex flex-shrink-0 flex-col border-l border-white/5 bg-white/[0.03] backdrop-blur-xl transition-all duration-300 ease-in-out ${
          isPanelOpen ? "w-[55%] opacity-100" : "w-0 overflow-hidden opacity-0"
        }`}
      >
        {isPanelOpen && (
          <>
            {/* Panel header */}
            <div className="flex flex-shrink-0 items-center justify-between border-b border-white/5 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <Scale className="h-4 w-4 text-yellow-400" />
                <p className="text-sm font-semibold text-white">
                  Comparison Results
                </p>
                {result && (
                  <span className="rounded-md bg-white/5 px-2 py-0.5 text-[10px] text-gray-500">
                    {result.agreements.length} agreements ·{" "}
                    {result.contradictions.length} contradictions
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setIsPanelOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-white/5 hover:text-white"
                aria-label="Close results panel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Panel body */}
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {error && <ErrorAlert message={error} />}

              {/* Loading skeleton */}
              {analyzing && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 rounded-xl border border-yellow-400/10 bg-yellow-400/5 px-4 py-3">
                    <Loader2 className="h-4 w-4 animate-spin text-yellow-400" />
                    <p className="text-sm text-yellow-300/70">
                      Analyzing papers with AI…
                    </p>
                  </div>
                  <div className="h-28 animate-pulse rounded-xl bg-white/5" />
                  <div className="h-36 animate-pulse rounded-xl bg-white/5" />
                  <div className="h-32 animate-pulse rounded-xl bg-white/5" />
                  <div className="h-24 animate-pulse rounded-xl bg-white/5" />
                </div>
              )}

              {/* Empty state after open */}
              {!analyzing && !result && !error && (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <Scale className="mb-3 h-8 w-8 text-yellow-400/15" />
                  <p className="text-sm text-gray-600">
                    Results will appear here once the analysis completes.
                  </p>
                </div>
              )}

              {/* Results */}
              {!analyzing && result && (
                <div className="space-y-6">
                  {result.agreements.length > 0 && (
                    <section>
                      <h2 className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                        <span className="h-2 w-2 rounded-full bg-teal-400" />
                        Agreements ({result.agreements.length})
                      </h2>
                      <div className="space-y-2">
                        {result.agreements.map((text, i) => (
                          <div
                            key={i}
                            className="rounded-xl border border-teal-500/15 bg-teal-500/[0.07] p-4 text-sm leading-relaxed text-gray-300"
                          >
                            {text}
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {result.contradictions.length > 0 && (
                    <section>
                      <h2 className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                        <span className="h-2 w-2 rounded-full bg-amber-400" />
                        Contradictions / Divergences ({result.contradictions.length})
                      </h2>
                      <div className="space-y-4">
                        {result.contradictions.map((c, i) => (
                          <ContradictionCard key={i} item={c} />
                        ))}
                      </div>
                    </section>
                  )}

                  {result.agreements.length === 0 &&
                    result.contradictions.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-16 text-center">
                        <Check className="mb-3 h-8 w-8 text-teal-400/40" />
                        <p className="text-sm text-gray-500">
                          No clear agreements or contradictions found.
                        </p>
                      </div>
                    )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Folder Section ── */
interface FolderSectionProps {
  id: string;
  name: string;
  papers: PaperListItem[];
  isExpanded: boolean;
  onToggle: () => void;
  selectedIds: Set<string>;
  onTogglePaper: (id: string) => void;
  maxReached: boolean;
}

function FolderSection({
  name,
  papers,
  isExpanded,
  onToggle,
  selectedIds,
  onTogglePaper,
  maxReached,
}: FolderSectionProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.03] backdrop-blur-sm">
      {/* Folder header */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-white/5"
      >
        {isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-gray-600" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-gray-600" />
        )}
        <Folder className="h-4 w-4 flex-shrink-0 text-yellow-400/60" />
        <span className="flex-1 truncate text-sm font-medium text-gray-300">
          {name}
        </span>
        <span className="flex-shrink-0 rounded-md bg-white/5 px-1.5 py-0.5 text-xs text-gray-600">
          {papers.length}
        </span>
      </button>

      {/* Papers list */}
      {isExpanded && (
        <div className="border-t border-white/5 px-2 py-2">
          {papers.length === 0 ? (
            <p className="px-3 py-3 text-xs text-gray-700">
              No papers in this folder.
            </p>
          ) : (
            <div className="space-y-1">
              {papers.map((p) => {
                const isSelected = selectedIds.has(p.id);
                const isDisabled = maxReached && !isSelected;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onTogglePaper(p.id)}
                    disabled={isDisabled}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all ${
                      isSelected
                        ? "bg-yellow-400/10 ring-1 ring-yellow-400/25"
                        : isDisabled
                          ? "cursor-not-allowed opacity-40"
                          : "hover:bg-white/[0.05]"
                    }`}
                  >
                    {/* Checkbox */}
                    <div
                      className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border transition-all ${
                        isSelected
                          ? "border-yellow-400 bg-yellow-400"
                          : "border-white/20 bg-transparent"
                      }`}
                    >
                      {isSelected && (
                        <Check className="h-3 w-3 text-[#131b20]" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p
                        className={`truncate text-sm font-medium leading-snug ${
                          isSelected ? "text-yellow-300" : "text-gray-300"
                        }`}
                        title={p.title || p.filename}
                      >
                        {p.title || p.filename}
                      </p>
                      {p.category && (
                        <p className="mt-0.5 truncate text-[10px] text-gray-600">
                          {p.category}
                        </p>
                      )}
                    </div>

                    <FileText
                      className={`h-4 w-4 flex-shrink-0 ${
                        isSelected ? "text-yellow-400/70" : "text-gray-700"
                      }`}
                    />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Contradiction Card ── */
function ContradictionCard({ item }: { item: ContradictionItem }) {
  return (
    <div className="overflow-hidden rounded-xl border border-amber-500/15 bg-amber-500/[0.06]">
      <div className="border-b border-amber-500/10 px-4 py-2.5">
        <p className="text-sm font-medium text-amber-300">{item.topic}</p>
      </div>
      <div className="space-y-3 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-white/5 bg-[#131b20]/60 p-3">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-400/70">
              Paper A
            </p>
            <p className="text-sm leading-relaxed text-gray-300">
              {item.paper_A_claim}
            </p>
          </div>
          <div className="rounded-lg border border-white/5 bg-[#131b20]/60 p-3">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-400/70">
              Paper B
            </p>
            <p className="text-sm leading-relaxed text-gray-300">
              {item.paper_B_claim}
            </p>
          </div>
        </div>
        <p className="border-t border-white/5 pt-3 text-sm leading-relaxed text-gray-400">
          {item.analysis}
        </p>
      </div>
    </div>
  );
}

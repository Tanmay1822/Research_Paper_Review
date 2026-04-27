"use client";

import {
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  Folder,
  Loader2,
  Scale,
  Search,
  Table2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import ErrorAlert from "@/components/ErrorAlert";
import {
  analyzeContradictions,
  fetchComparisonMatrix,
  fetchFolders,
  fetchPapers,
} from "@/utils/api";
import type {
  ContradictionItem,
  ContradictionReportResponse,
  FolderItem,
  MatrixRow,
  PaperListItem,
} from "@/utils/api";

const MIN_PAPERS = 2;
const MAX_CONTRADICTION = 3;
const MAX_MATRIX = 10;

type PanelMode = "contradiction" | "matrix";
type SortDir = "asc" | "desc";
type ColKey =
  | "title"
  | "category"
  | "core_problem"
  | "methodology"
  | "dataset"
  | "results"
  | "limitations";

const MATRIX_COLS: { key: ColKey; label: string }[] = [
  { key: "title", label: "Paper" },
  { key: "category", label: "Category" },
  { key: "core_problem", label: "Core Problem" },
  { key: "methodology", label: "Methodology" },
  { key: "dataset", label: "Dataset" },
  { key: "results", label: "Results" },
  { key: "limitations", label: "Limitations" },
];

function cellValue(row: MatrixRow, key: ColKey): string {
  if (key === "title") return row.title || row.filename;
  return (row[key as keyof MatrixRow] as string | null) ?? "";
}

function downloadCSV(rows: MatrixRow[]) {
  const headers = ["Paper", "Category", "Authors", "Core Problem", "Methodology", "Dataset", "Results", "Limitations"];
  const data = rows.map((r) => [
    r.title || r.filename,
    r.category,
    r.authors ?? "",
    r.core_problem ?? "",
    r.methodology ?? "",
    r.dataset ?? "",
    r.results ?? "",
    r.limitations ?? "",
  ]);
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const csv = [headers, ...data].map((row) => row.map(esc).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "methodology-comparison.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function ComparePapersPage() {
  const [papers, setPapers] = useState<PaperListItem[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(["root"]));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [panelMode, setPanelMode] = useState<PanelMode | null>(null);

  // Contradiction state
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<ContradictionReportResponse | null>(null);

  // Matrix state
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [matrixData, setMatrixData] = useState<MatrixRow[] | null>(null);
  const [sortCol, setSortCol] = useState<ColKey>("title");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filterText, setFilterText] = useState("");

  useEffect(() => {
    setError("");
    Promise.all([fetchPapers(), fetchFolders()])
      .then(([paperList, folderList]) => {
        setPapers(paperList);
        setFolders(folderList);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Unable to load your papers right now.")
      )
      .finally(() => setLoading(false));
  }, []);

  const togglePaper = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_MATRIX) next.add(id);
      return next;
    });
    setResult(null);
    setMatrixData(null);
    setError("");
  }, []);

  const toggleFolder = (id: string) =>
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const runContradiction = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length < MIN_PAPERS || ids.length > MAX_CONTRADICTION) return;
    setAnalyzing(true);
    setError("");
    setResult(null);
    setPanelMode("contradiction");
    setIsPanelOpen(true);
    try {
      setResult(await analyzeContradictions(ids));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed. Please try again.");
    } finally {
      setAnalyzing(false);
    }
  };

  const buildMatrix = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length < MIN_PAPERS) return;
    setMatrixLoading(true);
    setError("");
    setMatrixData(null);
    setFilterText("");
    setSortCol("title");
    setSortDir("asc");
    setPanelMode("matrix");
    setIsPanelOpen(true);
    try {
      setMatrixData(await fetchComparisonMatrix(ids));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to build matrix.");
    } finally {
      setMatrixLoading(false);
    }
  };

  const handleSort = (col: ColKey) => {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  };

  const filteredMatrix = (matrixData ?? []).filter((row) => {
    if (!filterText) return true;
    const lo = filterText.toLowerCase();
    return MATRIX_COLS.some((c) => cellValue(row, c.key).toLowerCase().includes(lo));
  });

  const sortedMatrix = [...filteredMatrix].sort((a, b) => {
    const av = cellValue(a, sortCol);
    const bv = cellValue(b, sortCol);
    return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
  });

  const selectedCount = selectedIds.size;
  const canContradiction = selectedCount >= MIN_PAPERS && selectedCount <= MAX_CONTRADICTION;
  const canMatrix = selectedCount >= MIN_PAPERS;
  const isBusy = analyzing || matrixLoading;

  const rootPapers = papers.filter((p) => p.folder_id === null);
  const getPapersForFolder = (fid: string) => papers.filter((p) => p.folder_id === fid);

  const panelWidth = panelMode === "matrix" ? "w-[68%]" : "w-[55%]";

  return (
    <div className="relative flex min-h-0 flex-1 overflow-hidden bg-gradient-to-br from-slate-900 via-[#0d1b26] to-[#0f1f1a]">
      {/* Ambient glow */}
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
            <h1 className="text-xl font-semibold tracking-tight text-white">Compare Papers</h1>
            <p className="mt-0.5 text-xs text-gray-500">
              Select up to {MAX_MATRIX} papers · Deep Comparison supports {MIN_PAPERS}–{MAX_CONTRADICTION}
            </p>
          </div>
          {selectedCount > 0 && (
            <span className="ml-auto rounded-lg border border-yellow-400/20 bg-yellow-400/10 px-3 py-1 text-xs font-medium text-yellow-300">
              {selectedCount} / {MAX_MATRIX} selected
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
                maxReached={selectedCount >= MAX_MATRIX}
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
                  maxReached={selectedCount >= MAX_MATRIX}
                />
              ))}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="mt-5 flex-shrink-0 space-y-2">
          {error && !isPanelOpen && <ErrorAlert message={error} />}

          {/* Build Matrix */}
          <button
            onClick={buildMatrix}
            disabled={!canMatrix || isBusy}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-6 py-2.5 text-sm font-medium text-gray-300 transition-all hover:border-yellow-400/20 hover:bg-yellow-400/5 hover:text-yellow-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {matrixLoading ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Building Matrix…</>
            ) : (
              <><Table2 className="h-4 w-4" /> Build Comparison Matrix</>
            )}
          </button>

          {/* Deep Comparison */}
          <button
            onClick={runContradiction}
            disabled={!canContradiction || isBusy}
            title={selectedCount > MAX_CONTRADICTION ? `Deep Comparison supports max ${MAX_CONTRADICTION} papers` : undefined}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-yellow-400 px-6 py-3 text-sm font-semibold text-[#131b20] shadow-[0_0_20px_rgba(250,204,21,0.2)] transition-all hover:bg-yellow-300 hover:shadow-[0_0_28px_rgba(250,204,21,0.35)] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          >
            {analyzing ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Running Deep Comparison…</>
            ) : (
              <><Scale className="h-4 w-4" /> Run Deep Comparison</>
            )}
          </button>
        </div>
      </div>

      {/* ══════════════ RIGHT: Sliding Results Panel ══════════════ */}
      <div
        className={`flex flex-shrink-0 flex-col border-l border-white/5 bg-white/[0.03] backdrop-blur-xl transition-all duration-300 ease-in-out ${
          isPanelOpen ? `${panelWidth} opacity-100` : "w-0 overflow-hidden opacity-0"
        }`}
      >
        {isPanelOpen && (
          <>
            {/* Panel header */}
            <div className="flex flex-shrink-0 items-center justify-between border-b border-white/5 px-5 py-4">
              <div className="flex items-center gap-2.5">
                {panelMode === "matrix" ? (
                  <Table2 className="h-4 w-4 text-yellow-400" />
                ) : (
                  <Scale className="h-4 w-4 text-yellow-400" />
                )}
                <p className="text-sm font-semibold text-white">
                  {panelMode === "matrix" ? "Comparison Matrix" : "Comparison Results"}
                </p>
                {panelMode === "matrix" && matrixData && (
                  <span className="rounded-md bg-white/5 px-2 py-0.5 text-[10px] text-gray-500">
                    {matrixData.length} papers · {filteredMatrix.length} shown
                  </span>
                )}
                {panelMode === "contradiction" && result && (
                  <span className="rounded-md bg-white/5 px-2 py-0.5 text-[10px] text-gray-500">
                    {result.agreements.length} agreements · {result.contradictions.length} contradictions
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {panelMode === "matrix" && matrixData && matrixData.length > 0 && (
                  <button
                    type="button"
                    onClick={() => downloadCSV(sortedMatrix)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:border-yellow-400/20 hover:bg-yellow-400/5 hover:text-yellow-300"
                  >
                    <Download className="h-3.5 w-3.5" />
                    CSV
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsPanelOpen(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-white/5 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Panel body */}
            <div className="min-h-0 flex-1 overflow-hidden">
              {error && <div className="p-4"><ErrorAlert message={error} /></div>}

              {/* ── MATRIX mode ── */}
              {panelMode === "matrix" && (
                <>
                  {matrixLoading && (
                    <div className="flex flex-col items-center justify-center gap-3 py-20">
                      <Loader2 className="h-6 w-6 animate-spin text-yellow-400" />
                      <p className="text-sm text-gray-500">Fetching knowledge cards…</p>
                    </div>
                  )}

                  {!matrixLoading && matrixData && matrixData.length > 0 && (
                    <div className="flex h-full flex-col">
                      {/* Filter bar */}
                      <div className="flex-shrink-0 border-b border-white/5 px-4 py-3">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-600" />
                          <input
                            type="text"
                            value={filterText}
                            onChange={(e) => setFilterText(e.target.value)}
                            placeholder="Filter rows…"
                            className="w-full rounded-lg border border-white/5 bg-[#131b20] py-1.5 pl-8 pr-3 text-xs text-gray-300 placeholder-gray-600 focus:border-yellow-400/30 focus:outline-none"
                            suppressHydrationWarning
                          />
                        </div>
                      </div>

                      {/* Table */}
                      <div className="min-h-0 flex-1 overflow-auto">
                        <table className="w-full border-collapse text-xs">
                          <thead className="sticky top-0 z-10 bg-[#0d1b26]">
                            <tr>
                              {MATRIX_COLS.map((col) => (
                                <th
                                  key={col.key}
                                  onClick={() => handleSort(col.key)}
                                  className="cursor-pointer select-none whitespace-nowrap border-b border-white/5 px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500 transition-colors hover:text-yellow-400"
                                >
                                  <span className="flex items-center gap-1">
                                    {col.label}
                                    <ArrowUpDown
                                      className={`h-3 w-3 flex-shrink-0 transition-colors ${
                                        sortCol === col.key ? "text-yellow-400" : "text-gray-700"
                                      }`}
                                    />
                                  </span>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {sortedMatrix.length === 0 ? (
                              <tr>
                                <td colSpan={MATRIX_COLS.length} className="py-12 text-center text-xs text-gray-600">
                                  No rows match your filter.
                                </td>
                              </tr>
                            ) : (
                              sortedMatrix.map((row, idx) => (
                                <tr
                                  key={row.id}
                                  className={`transition-colors hover:bg-white/[0.03] ${
                                    idx % 2 === 0 ? "bg-transparent" : "bg-white/[0.015]"
                                  }`}
                                >
                                  {MATRIX_COLS.map((col) => {
                                    const val = cellValue(row, col.key);
                                    const isEmpty = !val;
                                    return (
                                      <td
                                        key={col.key}
                                        className="min-w-[160px] max-w-[240px] border-b border-white/5 px-4 py-3 align-top"
                                        title={val || undefined}
                                      >
                                        {col.key === "category" ? (
                                          <span className="inline-flex rounded-md bg-white/5 px-2 py-0.5 text-[10px] font-medium text-gray-400">
                                            {val || "—"}
                                          </span>
                                        ) : isEmpty ? (
                                          <span className="text-gray-700">—</span>
                                        ) : (
                                          <p className="line-clamp-3 leading-relaxed text-gray-300">
                                            {val}
                                          </p>
                                        )}
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {!matrixLoading && (!matrixData || matrixData.length === 0) && !error && (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                      <Table2 className="mb-3 h-8 w-8 text-yellow-400/15" />
                      <p className="text-sm text-gray-600">No data available.</p>
                    </div>
                  )}
                </>
              )}

              {/* ── CONTRADICTION mode ── */}
              {panelMode === "contradiction" && (
                <div className="min-h-0 flex-1 overflow-y-auto p-5">
                  {analyzing && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 rounded-xl border border-yellow-400/10 bg-yellow-400/5 px-4 py-3">
                        <Loader2 className="h-4 w-4 animate-spin text-yellow-400" />
                        <p className="text-sm text-yellow-300/70">Analyzing papers with AI…</p>
                      </div>
                      <div className="h-28 animate-pulse rounded-xl bg-white/5" />
                      <div className="h-36 animate-pulse rounded-xl bg-white/5" />
                      <div className="h-32 animate-pulse rounded-xl bg-white/5" />
                    </div>
                  )}

                  {!analyzing && !result && !error && (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                      <Scale className="mb-3 h-8 w-8 text-yellow-400/15" />
                      <p className="text-sm text-gray-600">Results will appear here once the analysis completes.</p>
                    </div>
                  )}

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
                              <div key={i} className="rounded-xl border border-teal-500/15 bg-teal-500/[0.07] p-4 text-sm leading-relaxed text-gray-300">
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

                      {result.agreements.length === 0 && result.contradictions.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                          <Check className="mb-3 h-8 w-8 text-teal-400/40" />
                          <p className="text-sm text-gray-500">No clear agreements or contradictions found.</p>
                        </div>
                      )}
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

function FolderSection({ name, papers, isExpanded, onToggle, selectedIds, onTogglePaper, maxReached }: FolderSectionProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.03] backdrop-blur-sm">
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
        <span className="flex-1 truncate text-sm font-medium text-gray-300">{name}</span>
        <span className="flex-shrink-0 rounded-md bg-white/5 px-1.5 py-0.5 text-xs text-gray-600">
          {papers.length}
        </span>
      </button>

      {isExpanded && (
        <div className="border-t border-white/5 px-2 py-2">
          {papers.length === 0 ? (
            <p className="px-3 py-3 text-xs text-gray-700">No papers in this folder.</p>
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
                    <div
                      className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border transition-all ${
                        isSelected ? "border-yellow-400 bg-yellow-400" : "border-white/20 bg-transparent"
                      }`}
                    >
                      {isSelected && <Check className="h-3 w-3 text-[#131b20]" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`truncate text-sm font-medium leading-snug ${isSelected ? "text-yellow-300" : "text-gray-300"}`}
                        title={p.title || p.filename}
                      >
                        {p.title || p.filename}
                      </p>
                      {p.category && (
                        <p className="mt-0.5 truncate text-[10px] text-gray-600">{p.category}</p>
                      )}
                    </div>
                    <FileText className={`h-4 w-4 flex-shrink-0 ${isSelected ? "text-yellow-400/70" : "text-gray-700"}`} />
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
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-400/70">Paper A</p>
            <p className="text-sm leading-relaxed text-gray-300">{item.paper_A_claim}</p>
          </div>
          <div className="rounded-lg border border-white/5 bg-[#131b20]/60 p-3">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-400/70">Paper B</p>
            <p className="text-sm leading-relaxed text-gray-300">{item.paper_B_claim}</p>
          </div>
        </div>
        <p className="border-t border-white/5 pt-3 text-sm leading-relaxed text-gray-400">{item.analysis}</p>
      </div>
    </div>
  );
}

"use client";

import {
  ArrowUpDown,
  BookText,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  FileText,
  Folder,
  Lightbulb,
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
  findResearchGaps,
  generateLiteratureReview,
} from "@/utils/api";
import type {
  ContradictionItem,
  ContradictionReportResponse,
  FolderItem,
  GapReport,
  MatrixRow,
  PaperListItem,
} from "@/utils/api";

const MIN_PAPERS = 2;
const MAX_CONTRADICTION = 3;
const MAX_MATRIX = 10;

type PanelMode = "contradiction" | "matrix" | "gaps" | "litreview";
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

  // Gap Finder state
  const [gapLoading, setGapLoading] = useState(false);
  const [gapReport, setGapReport] = useState<GapReport | null>(null);

  // Literature Review state
  const [litLoading, setLitLoading] = useState(false);
  const [litDraft, setLitDraft] = useState<string | null>(null);
  const [litCopied, setLitCopied] = useState(false);

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

  const runGapFinder = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length < MIN_PAPERS) return;
    setGapLoading(true);
    setError("");
    setGapReport(null);
    setPanelMode("gaps");
    setIsPanelOpen(true);
    try {
      setGapReport(await findResearchGaps(ids));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gap analysis failed.");
    } finally {
      setGapLoading(false);
    }
  };

  const runLitReview = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length < MIN_PAPERS) return;
    setLitLoading(true);
    setError("");
    setLitDraft(null);
    setLitCopied(false);
    setPanelMode("litreview");
    setIsPanelOpen(true);
    try {
      const { draft } = await generateLiteratureReview(ids);
      setLitDraft(draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Literature review generation failed.");
    } finally {
      setLitLoading(false);
    }
  };

  const copyLitReview = () => {
    if (!litDraft) return;
    navigator.clipboard.writeText(litDraft).then(() => {
      setLitCopied(true);
      setTimeout(() => setLitCopied(false), 2000);
    });
  };

  const selectedCount = selectedIds.size;
  const canContradiction = selectedCount >= MIN_PAPERS && selectedCount <= MAX_CONTRADICTION;
  const canMatrix = selectedCount >= MIN_PAPERS;
  const isBusy = analyzing || matrixLoading || gapLoading || litLoading;

  const rootPapers = papers.filter((p) => p.folder_id === null);
  const getPapersForFolder = (fid: string) => papers.filter((p) => p.folder_id === fid);

  const panelWidth =
    panelMode === "matrix" ? "w-[68%]" :
    panelMode === "litreview" ? "w-[60%]" :
    "w-[55%]";

  return (
    <div className="relative flex min-h-0 flex-1 overflow-hidden bg-[var(--background)]">
      {/* ══════════════ LEFT: Paper Selection ══════════════ */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-6">
        {/* Header */}
        <div className="mb-6 flex flex-shrink-0 items-center gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent)]/70 ring-1 ring-[var(--cta)]/25">
            <Scale className="h-5 w-5 text-[var(--cta)]" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">Compare Papers</h1>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              Select up to {MAX_MATRIX} papers · Deep Comparison supports {MIN_PAPERS}–{MAX_CONTRADICTION}
            </p>
          </div>
          {selectedCount > 0 && (
            <span className="ml-auto rounded-lg border border-[var(--cta)]/25 bg-[var(--accent)]/70 px-3 py-1 text-xs font-medium text-[var(--foreground)]">
              {selectedCount} / {MAX_MATRIX} selected
            </span>
          )}
        </div>

        {/* Folder accordion */}
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]/60" />
            </div>
          ) : papers.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] py-20 text-center">
              <FileText className="mb-3 h-8 w-8 text-[var(--muted)]" />
              <p className="text-sm text-[var(--muted)]">No papers in your library.</p>
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
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] px-6 py-2.5 text-sm font-medium text-[var(--foreground)] transition-all hover:border-[var(--cta)]/40 hover:bg-[var(--accent)]/45 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {matrixLoading ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Building Matrix…</>
            ) : (
              <><Table2 className="h-4 w-4" /> Build Comparison Matrix</>
            )}
          </button>

          {/* Research Gap Finder */}
          <button
            onClick={runGapFinder}
            disabled={!canMatrix || isBusy}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] px-6 py-2.5 text-sm font-medium text-[var(--foreground)] transition-all hover:border-[var(--cta)]/40 hover:bg-[var(--accent)]/45 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {gapLoading ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Finding Gaps…</>
            ) : (
              <><Lightbulb className="h-4 w-4" /> Find Research Gaps</>
            )}
          </button>

          {/* Literature Review */}
          <button
            onClick={runLitReview}
            disabled={!canMatrix || isBusy}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] px-6 py-2.5 text-sm font-medium text-[var(--foreground)] transition-all hover:border-[var(--cta)]/40 hover:bg-[var(--accent)]/45 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {litLoading ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Drafting Review…</>
            ) : (
              <><BookText className="h-4 w-4" /> Draft Literature Review</>
            )}
          </button>

          {/* Deep Comparison */}
          <button
            onClick={runContradiction}
            disabled={!canContradiction || isBusy}
            title={selectedCount > MAX_CONTRADICTION ? `Deep Comparison supports max ${MAX_CONTRADICTION} papers` : undefined}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-6 py-3 text-sm font-semibold text-[var(--foreground)] shadow-sm transition-all hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
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
        className={`flex flex-shrink-0 flex-col border-l border-[var(--border)] bg-[var(--surface-elevated)]/90 backdrop-blur-xl transition-all duration-300 ease-in-out ${
          isPanelOpen ? `${panelWidth} opacity-100` : "w-0 overflow-hidden opacity-0"
        }`}
      >
        {isPanelOpen && (
          <>
            {/* Panel header */}
            <div className="flex flex-shrink-0 items-center justify-between border-b border-[var(--border)] px-5 py-4">
              <div className="flex items-center gap-2.5">
                {panelMode === "matrix" && <Table2 className="h-4 w-4 text-[var(--cta)]" />}
                {panelMode === "contradiction" && <Scale className="h-4 w-4 text-[var(--cta)]" />}
                {panelMode === "gaps" && <Lightbulb className="h-4 w-4 text-[var(--cta)]" />}
                {panelMode === "litreview" && <BookText className="h-4 w-4 text-[var(--cta)]" />}
                <p className="text-sm font-semibold text-[var(--foreground)]">
                  {panelMode === "matrix" && "Comparison Matrix"}
                  {panelMode === "contradiction" && "Deep Comparison"}
                  {panelMode === "gaps" && "Research Gaps"}
                  {panelMode === "litreview" && "Literature Review Draft"}
                </p>
                {panelMode === "matrix" && matrixData && (
                  <span className="rounded-md bg-[var(--surface)] px-2 py-0.5 text-[10px] text-[var(--muted)]">
                    {matrixData.length} papers · {filteredMatrix.length} shown
                  </span>
                )}
                {panelMode === "contradiction" && result && (
                  <span className="rounded-md bg-[var(--surface)] px-2 py-0.5 text-[10px] text-[var(--muted)]">
                    {result.agreements.length} agreements · {result.contradictions.length} contradictions
                  </span>
                )}
                {panelMode === "gaps" && gapReport && (
                  <span className="rounded-md bg-[var(--surface)] px-2 py-0.5 text-[10px] text-[var(--muted)]">
                    {gapReport.gaps.length} gaps · {gapReport.future_directions.length} directions
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {panelMode === "matrix" && matrixData && matrixData.length > 0 && (
                  <button
                    type="button"
                    onClick={() => downloadCSV(sortedMatrix)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] transition-colors hover:border-[var(--cta)]/35 hover:bg-[var(--accent)]/55"
                  >
                    <Download className="h-3.5 w-3.5" />
                    CSV
                  </button>
                )}
                {panelMode === "litreview" && litDraft && (
                  <button
                    type="button"
                    onClick={copyLitReview}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] transition-colors hover:border-[var(--cta)]/35 hover:bg-[var(--accent)]/55"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {litCopied ? "Copied!" : "Copy"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsPanelOpen(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
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
                      <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
                      <p className="text-sm text-[var(--muted)]">Fetching knowledge cards…</p>
                    </div>
                  )}

                  {!matrixLoading && matrixData && matrixData.length > 0 && (
                    <div className="flex h-full flex-col">
                      {/* Filter bar */}
                      <div className="flex-shrink-0 border-b border-[var(--border)] px-4 py-3">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--muted)]" />
                          <input
                            type="text"
                            value={filterText}
                            onChange={(e) => setFilterText(e.target.value)}
                            placeholder="Filter rows…"
                            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] py-1.5 pl-8 pr-3 text-xs text-[var(--foreground)] placeholder:text-[var(--muted)] focus:border-[var(--cta)]/35 focus:outline-none"
                            suppressHydrationWarning
                          />
                        </div>
                      </div>

                      {/* Table */}
                      <div className="min-h-0 flex-1 overflow-auto">
                        <table className="w-full border-collapse text-xs">
                          <thead className="sticky top-0 z-10 bg-[var(--surface)]">
                            <tr>
                              {MATRIX_COLS.map((col) => (
                                <th
                                  key={col.key}
                                  onClick={() => handleSort(col.key)}
                                  className="cursor-pointer select-none whitespace-nowrap border-b border-[var(--border)] px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
                                >
                                  <span className="flex items-center gap-1">
                                    {col.label}
                                    <ArrowUpDown
                                      className={`h-3 w-3 flex-shrink-0 transition-colors ${
                                        sortCol === col.key ? "text-[var(--cta)]" : "text-[var(--muted)]"
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
                                <td colSpan={MATRIX_COLS.length} className="py-12 text-center text-xs text-[var(--muted)]">
                                  No rows match your filter.
                                </td>
                              </tr>
                            ) : (
                              sortedMatrix.map((row, idx) => (
                                <tr
                                  key={row.id}
                                  className={`transition-colors hover:bg-[var(--surface-soft)] ${
                                    idx % 2 === 0 ? "bg-transparent" : "bg-[var(--surface)]/50"
                                  }`}
                                >
                                  {MATRIX_COLS.map((col) => {
                                    const val = cellValue(row, col.key);
                                    const isEmpty = !val;
                                    return (
                                      <td
                                        key={col.key}
                                        className="min-w-[160px] max-w-[240px] border-b border-[var(--border)] px-4 py-3 align-top"
                                        title={val || undefined}
                                      >
                                        {col.key === "category" ? (
                                          <span className="inline-flex rounded-md bg-[var(--surface)] px-2 py-0.5 text-[10px] font-medium text-[var(--muted)]">
                                            {val || "—"}
                                          </span>
                                        ) : isEmpty ? (
                                          <span className="text-[var(--muted)]">—</span>
                                        ) : (
                                          <p className="line-clamp-3 leading-relaxed text-[var(--foreground)]">
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
                      <Table2 className="mb-3 h-8 w-8 text-[var(--primary)]/30" />
                      <p className="text-sm text-[var(--muted)]">No data available.</p>
                    </div>
                  )}
                </>
              )}

              {/* ── GAP FINDER mode ── */}
              {panelMode === "gaps" && (
                <div className="min-h-0 flex-1 overflow-y-auto p-5">
                  {gapLoading && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                        <Loader2 className="h-4 w-4 animate-spin text-[var(--primary)]" />
                        <p className="text-sm text-[var(--muted)]">Analyzing gaps with AI…</p>
                      </div>
                      {[1, 2, 3].map((i) => <div key={i} className={`h-${i === 2 ? 28 : 20} animate-pulse rounded-xl bg-[var(--surface)]`} />)}
                    </div>
                  )}
                  {!gapLoading && gapReport && (
                    <div className="space-y-6">
                      <section>
                        <h2 className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                          <span className="h-2 w-2 rounded-full bg-[var(--primary)]" />
                          Open Research Gaps {gapReport.gaps.length > 0 ? `(${gapReport.gaps.length})` : ""}
                        </h2>
                        {gapReport.gaps.length > 0 ? (
                          <div className="space-y-2">
                            {gapReport.gaps.map((g, i) => (
                              <div key={i} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm leading-relaxed text-[var(--foreground)]">
                                {g}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                            <p className="text-sm text-[var(--muted)]">No distinct gaps identified from the extracted content.</p>
                          </div>
                        )}
                      </section>
                      <section>
                        <h2 className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                          <span className="h-2 w-2 rounded-full bg-[var(--primary)]" />
                          Future Directions {gapReport.future_directions.length > 0 ? `(${gapReport.future_directions.length})` : ""}
                        </h2>
                        {gapReport.future_directions.length > 0 ? (
                          <div className="space-y-2">
                            {gapReport.future_directions.map((d, i) => (
                              <div key={i} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm leading-relaxed text-[var(--foreground)]">
                                {d}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                            <p className="text-sm text-[var(--muted)]">No future directions could be derived from the extracted content.</p>
                          </div>
                        )}
                      </section>
                    </div>
                  )}
                  {!gapLoading && !gapReport && !error && (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                      <Lightbulb className="mb-3 h-8 w-8 text-[var(--primary)]/30" />
                      <p className="text-sm text-[var(--muted)]">Results will appear once the analysis completes.</p>
                    </div>
                  )}
                </div>
              )}

              {/* ── LITERATURE REVIEW mode ── */}
              {panelMode === "litreview" && (
                <div className="min-h-0 flex-1 overflow-y-auto p-5">
                  {litLoading && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                        <Loader2 className="h-4 w-4 animate-spin text-[var(--primary)]" />
                        <p className="text-sm text-[var(--muted)]">Drafting literature review…</p>
                      </div>
                      {[1, 2, 3, 4].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-[var(--surface)]" />)}
                    </div>
                  )}
                  {!litLoading && litDraft && (
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
                      <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Related Work — Draft</p>
                      <div className="max-h-[calc(100vh-240px)] overflow-y-auto pr-1">
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--foreground)]">{litDraft}</p>
                      </div>
                    </div>
                  )}
                  {!litLoading && !litDraft && !error && (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                      <BookText className="mb-3 h-8 w-8 text-[var(--primary)]/30" />
                      <p className="text-sm text-[var(--muted)]">Your literature review draft will appear here.</p>
                    </div>
                  )}
                </div>
              )}

              {/* ── CONTRADICTION mode ── */}
              {panelMode === "contradiction" && (
                <div className="min-h-0 flex-1 overflow-y-auto p-5">
                  {analyzing && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                        <Loader2 className="h-4 w-4 animate-spin text-[var(--primary)]" />
                        <p className="text-sm text-[var(--muted)]">Analyzing papers…</p>
                      </div>
                      <div className="h-28 animate-pulse rounded-xl bg-[var(--surface)]" />
                      <div className="h-36 animate-pulse rounded-xl bg-[var(--surface)]" />
                      <div className="h-32 animate-pulse rounded-xl bg-[var(--surface)]" />
                    </div>
                  )}

                  {!analyzing && !result && !error && (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                      <Scale className="mb-3 h-8 w-8 text-[var(--primary)]/30" />
                      <p className="text-sm text-[var(--muted)]">Results will appear here once the analysis completes.</p>
                    </div>
                  )}

                  {!analyzing && result && (
                    <div className="space-y-6">
                      {/* Agreements — always shown, explicit "none" if empty */}
                      <section>
                        <h2 className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                          <span className="h-2 w-2 rounded-full bg-[var(--primary)]" />
                          Similarities{result.agreements.length > 0 ? ` (${result.agreements.length})` : ""}
                        </h2>
                        {result.agreements.length > 0 ? (
                          <div className="space-y-2">
                            {result.agreements.map((text, i) => (
                              <div key={i} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm leading-relaxed text-[var(--foreground)]">
                                {text}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                            <p className="text-sm text-[var(--muted)]">No similarities found between these papers based on their extracted content.</p>
                          </div>
                        )}
                      </section>

                      {/* Contradictions — always shown, explicit "none" if empty */}
                      <section>
                        <h2 className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                          <span className="h-2 w-2 rounded-full bg-[var(--primary)]" />
                          Contradictions / Divergences{result.contradictions.length > 0 ? ` (${result.contradictions.length})` : ""}
                        </h2>
                        {result.contradictions.length > 0 ? (
                          <div className="space-y-4">
                            {result.contradictions.map((c, i) => (
                              <ContradictionCard key={i} item={c} />
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                            <p className="text-sm text-[var(--muted)]">No direct contradictions found between these papers based on their extracted content.</p>
                          </div>
                        )}
                      </section>
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
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-[var(--surface)]"
      >
        {isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-[var(--muted)]" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-[var(--muted)]" />
        )}
        <Folder className="h-4 w-4 flex-shrink-0 text-[var(--cta)]/75" />
        <span className="flex-1 truncate text-sm font-medium text-[var(--foreground)]">{name}</span>
        <span className="flex-shrink-0 rounded-md bg-[var(--surface)] px-1.5 py-0.5 text-xs text-[var(--muted)]">
          {papers.length}
        </span>
      </button>

      {isExpanded && (
        <div className="border-t border-[var(--border)] px-2 py-2">
          {papers.length === 0 ? (
            <p className="px-3 py-3 text-xs text-[var(--muted)]">No papers in this folder.</p>
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
                        ? "bg-[var(--accent)]/70 ring-1 ring-[var(--cta)]/30"
                        : isDisabled
                          ? "cursor-not-allowed opacity-40"
                          : "hover:bg-[var(--surface)]"
                    }`}
                  >
                    <div
                      className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border transition-all ${
                        isSelected ? "border-[var(--cta)] bg-[var(--cta)]" : "border-[var(--border)] bg-transparent"
                      }`}
                    >
                      {isSelected && <Check className="h-3 w-3 text-[var(--surface-elevated)]" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`truncate text-sm font-medium leading-snug ${isSelected ? "text-[var(--foreground)]" : "text-[var(--foreground)]"}`}
                        title={p.title || p.filename}
                      >
                        {p.title || p.filename}
                      </p>
                      {p.category && (
                        <p className="mt-0.5 truncate text-[10px] text-[var(--muted)]">{p.category}</p>
                      )}
                    </div>
                    <FileText className={`h-4 w-4 flex-shrink-0 ${isSelected ? "text-[var(--cta)]" : "text-[var(--muted)]"}`} />
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
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)]">
      <div className="border-b border-[var(--border)] px-4 py-2.5">
        <p className="text-sm font-medium text-[var(--foreground)]">{item.topic}</p>
      </div>
      <div className="space-y-3 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Paper A</p>
            <p className="text-sm leading-relaxed text-[var(--foreground)]">{item.paper_A_claim}</p>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Paper B</p>
            <p className="text-sm leading-relaxed text-[var(--foreground)]">{item.paper_B_claim}</p>
          </div>
        </div>
        <p className="border-t border-[var(--border)] pt-3 text-sm leading-relaxed text-[var(--muted)]">{item.analysis}</p>
      </div>
    </div>
  );
}

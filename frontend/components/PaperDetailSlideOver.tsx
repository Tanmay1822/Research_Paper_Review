"use client";

import { ChevronLeft, Download, ExternalLink, FileText, Loader2, MessageSquare, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { fetchChatThreads, fetchPaperBibtexBlob, fetchPaperDetail, fetchPaperPdfBlob } from "@/utils/api";
import type { PaperDetail, ThreadListItem } from "@/utils/api";

interface PaperDetailSlideOverProps {
  paperId: string | null;
  onClose: () => void;
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}

type View = "card" | "pdf";

export default function PaperDetailSlideOver({ paperId, onClose }: PaperDetailSlideOverProps) {
  const [paper, setPaper] = useState<PaperDetail | null>(null);
  const [threads, setThreads] = useState<ThreadListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloadingBib, setDownloadingBib] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [view, setView] = useState<View>("card");
  const pdfBlobRef = useRef<string | null>(null);

  const handleViewPdf = async () => {
    if (!paperId || loadingPdf) return;
    // If already loaded, just switch view
    if (pdfUrl) { setView("pdf"); return; }
    setLoadingPdf(true);
    setError("");
    try {
      const blob = await fetchPaperPdfBlob(paperId);
      const url = URL.createObjectURL(blob);
      pdfBlobRef.current = url;
      setPdfUrl(url);
      setView("pdf");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load PDF.");
    } finally {
      setLoadingPdf(false);
    }
  };

  const handleBibtexDownload = async () => {
    if (!paperId || !paper || downloadingBib) return;
    setDownloadingBib(true);
    setError("");
    try {
      const blob = await fetchPaperBibtexBlob(paperId);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${(paper.filename || "reference").replace(/\.pdf$/i, "")}.bib`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to export BibTeX right now.");
    } finally {
      setDownloadingBib(false);
    }
  };

  // Reset PDF state when paper changes
  useEffect(() => {
    if (pdfBlobRef.current) {
      URL.revokeObjectURL(pdfBlobRef.current);
      pdfBlobRef.current = null;
    }
    setPdfUrl(null);
    setView("card");
  }, [paperId]);

  useEffect(() => {
    if (!paperId) { setPaper(null); setThreads([]); setLoading(false); return; }
    setLoading(true);
    setError("");
    Promise.all([fetchPaperDetail(paperId), fetchChatThreads(paperId)])
      .then(([p, t]) => { setPaper(p); setThreads(t); })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [paperId]);

  if (!paperId) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-[rgba(60,53,47,0.28)] backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      <div className="relative flex w-full max-w-lg flex-col bg-[var(--surface-elevated)] shadow-2xl">
        {/* ── Header ── */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-[var(--border)] px-6 py-4">
          {view === "pdf" ? (
            <button
              onClick={() => setView("card")}
              className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)] hover:text-[var(--cta)] transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              Back to Details
            </button>
          ) : (
            <h2 className="text-lg font-semibold text-[var(--foreground)]">Paper Details</h2>
          )}
          <div className="flex items-center gap-2">
            {view === "pdf" && pdfUrl && (
              <a
                href={pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--primary-hover)]"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open in tab
              </a>
            )}
            <button
              onClick={onClose}
              className="rounded-xl p-2 text-[var(--muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── PDF view ── */}
        {view === "pdf" && pdfUrl && (
          <div className="flex-1 overflow-hidden">
            <iframe
              src={pdfUrl}
              title="PDF Viewer"
              className="h-full w-full border-0"
            />
          </div>
        )}

        {/* ── Knowledge Card + Threads view ── */}
        {view === "card" && (
          <div className="flex-1 overflow-y-auto p-6">
            {loading && (
              <div className="py-16 text-center font-medium text-[var(--muted)]">Loading…</div>
            )}
            {error && (
              <p className="py-4 text-sm text-[var(--danger)]">{error}</p>
            )}
            {!loading && paper && (
              <div className="space-y-6">
                {/* Knowledge Card */}
                <div>
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                    Knowledge Card
                  </h3>
                  <div className="mb-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleViewPdf}
                      disabled={loadingPdf}
                      className="inline-flex items-center gap-2 rounded-lg bg-[var(--cta)]/15 px-3 py-2 text-xs font-medium text-[var(--cta)] ring-1 ring-[var(--cta)]/30 hover:bg-[var(--cta)]/25 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {loadingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                      {loadingPdf ? "Loading PDF…" : "View PDF"}
                    </button>
                    <button
                      type="button"
                      onClick={handleBibtexDownload}
                      disabled={downloadingBib}
                      className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-3 py-2 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Download className="h-4 w-4" />
                      {downloadingBib ? "Preparing BibTeX…" : "Download BibTeX"}
                    </button>
                  </div>
                  <div className="space-y-4 rounded-xl bg-[var(--surface)] p-5 text-sm">
                    {paper.core_problem && (
                      <div>
                        <span className="font-medium text-[var(--foreground)]">Core Problem</span>
                        <p className="mt-0.5 text-[var(--muted)]">{paper.core_problem}</p>
                      </div>
                    )}
                    {paper.methodology && (
                      <div>
                        <span className="font-medium text-[var(--foreground)]">Methodology</span>
                        <p className="mt-0.5 text-[var(--muted)]">{paper.methodology}</p>
                      </div>
                    )}
                    {paper.dataset && (
                      <div>
                        <span className="font-medium text-[var(--foreground)]">Dataset</span>
                        <p className="mt-0.5 text-[var(--muted)]">{paper.dataset}</p>
                      </div>
                    )}
                    {paper.results && (
                      <div>
                        <span className="font-medium text-[var(--foreground)]">Results</span>
                        <p className="mt-0.5 text-[var(--muted)]">{paper.results}</p>
                      </div>
                    )}
                    {paper.limitations && (
                      <div>
                        <span className="font-medium text-[var(--foreground)]">Limitations</span>
                        <p className="mt-0.5 text-[var(--muted)]">{paper.limitations}</p>
                      </div>
                    )}
                    {!paper.core_problem && !paper.methodology && !paper.dataset && !paper.results && !paper.limitations && (
                      <p className="italic text-[var(--muted)]">No Knowledge Card data available.</p>
                    )}
                  </div>
                </div>

                {/* Past Conversations */}
                <div>
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                    Past Conversations
                  </h3>
                  {threads.length === 0 ? (
                    <p className="text-sm text-[var(--muted)]">No conversations yet.</p>
                  ) : (
                    <ul className="space-y-2">
                      {threads.map((t) => (
                        <li
                          key={t.id}
                          className="flex items-center justify-between rounded-xl bg-[var(--surface)] p-4 transition-colors hover:bg-[var(--accent)]/50"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-[var(--foreground)]">{t.title || "Chat"}</p>
                            <p className="mt-0.5 text-xs text-[var(--muted)]">{formatDate(t.created_at)}</p>
                          </div>
                          <Link
                            href={`/dashboard/chat?thread_id=${t.id}`}
                            className="ml-3 flex items-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--primary-hover)]"
                          >
                            <MessageSquare className="w-4 h-4" />
                            Resume Chat
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

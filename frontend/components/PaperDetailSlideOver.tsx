"use client";

import { Download, MessageSquare, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchChatThreads, fetchPaperBibtexBlob, fetchPaperDetail } from "@/utils/api";
import type { PaperDetail, ThreadListItem } from "@/utils/api";

interface PaperDetailSlideOverProps {
  paperId: string | null;
  onClose: () => void;
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function PaperDetailSlideOver({ paperId, onClose }: PaperDetailSlideOverProps) {
  const [paper, setPaper] = useState<PaperDetail | null>(null);
  const [threads, setThreads] = useState<ThreadListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloadingBib, setDownloadingBib] = useState(false);

  const handleBibtexDownload = async () => {
    if (!paperId || !paper || downloadingBib) return;
    setDownloadingBib(true);
    setError("");
    try {
      const blob = await fetchPaperBibtexBlob(paperId);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const safeBase = (paper.filename || "reference").replace(/\.pdf$/i, "");
      anchor.href = url;
      anchor.download = `${safeBase}.bib`;
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

  useEffect(() => {
    if (!paperId) {
      setPaper(null);
      setThreads([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    Promise.all([
      fetchPaperDetail(paperId),
      fetchChatThreads(paperId),
    ])
      .then(([p, t]) => {
        setPaper(p);
        setThreads(t);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [paperId]);

  if (!paperId) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative w-full max-w-lg bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Paper Details</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {loading && (
            <div className="py-16 text-center text-slate-500 font-medium">Loading…</div>
          )}
          {error && (
            <p className="py-4 text-red-600 text-sm">{error}</p>
          )}
          {!loading && paper && (
            <>
              <div className="space-y-6">
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                    Knowledge Card
                  </h3>
                  <div className="mb-3">
                    <button
                      type="button"
                      onClick={handleBibtexDownload}
                      disabled={downloadingBib}
                      className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Download className="h-4 w-4" />
                      {downloadingBib ? "Preparing BibTeX…" : "Download BibTeX"}
                    </button>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-5 space-y-4 text-sm">
                    {paper.core_problem && (
                      <div>
                        <span className="font-medium text-slate-700">Core Problem</span>
                        <p className="mt-0.5 text-slate-600">{paper.core_problem}</p>
                      </div>
                    )}
                    {paper.methodology && (
                      <div>
                        <span className="font-medium text-slate-700">Methodology</span>
                        <p className="mt-0.5 text-slate-600">{paper.methodology}</p>
                      </div>
                    )}
                    {paper.dataset && (
                      <div>
                        <span className="font-medium text-slate-700">Dataset</span>
                        <p className="mt-0.5 text-slate-600">{paper.dataset}</p>
                      </div>
                    )}
                    {paper.results && (
                      <div>
                        <span className="font-medium text-slate-700">Results</span>
                        <p className="mt-0.5 text-slate-600">{paper.results}</p>
                      </div>
                    )}
                    {paper.limitations && (
                      <div>
                        <span className="font-medium text-slate-700">Limitations</span>
                        <p className="mt-0.5 text-slate-600">{paper.limitations}</p>
                      </div>
                    )}
                    {!paper.core_problem && !paper.methodology && !paper.dataset && !paper.results && !paper.limitations && (
                      <p className="text-slate-500 italic">No Knowledge Card data available.</p>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                    Past Conversations
                  </h3>
                  {threads.length === 0 ? (
                    <p className="text-sm text-slate-500">No conversations yet.</p>
                  ) : (
                    <ul className="space-y-2">
                      {threads.map((t) => (
                        <li
                          key={t.id}
                          className="flex items-center justify-between p-4 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-slate-800 truncate">
                              {t.title || "Chat"}
                            </p>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {formatDate(t.created_at)}
                            </p>
                          </div>
                          <Link
                            href={`/dashboard/chat?thread_id=${t.id}`}
                            className="ml-3 flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import { FileText, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import ChatWindow from "@/components/ChatWindow";
import ContextDrawer, { type PaperWithUrl } from "@/components/ContextDrawer";
import ErrorAlert from "@/components/ErrorAlert";
import { fetchPaperPdfBlob, fetchThreadDetail } from "@/utils/api";
import type { ChatMessage } from "@/components/ChatWindow";

function basename(filename: string): string {
  const last = filename.replace(/\\/g, "/").split("/").pop();
  return last ?? filename;
}

function ChatContent() {
  const searchParams = useSearchParams();
  const threadIdParam = searchParams.get("thread_id");

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [threadId, setThreadId] = useState<string | null>(threadIdParam);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [papers, setPapers] = useState<PaperWithUrl[]>([]);

  // PDF pane state
  const [isPdfOpen, setIsPdfOpen] = useState(false);
  const [activePdfUrl, setActivePdfUrl] = useState<string | null>(null);
  const [activePage, setActivePage] = useState(1);
  const [activePdfTitle, setActivePdfTitle] = useState("");

  const [loadingThread, setLoadingThread] = useState(!!threadIdParam);
  const [error, setError] = useState("");
  const activeBlobUrlRef = useRef<string | null>(null);

  // Drag state: paper id being dragged from left sidebar
  const [draggedPaperId, setDraggedPaperId] = useState<string | null>(null);

  useEffect(() => {
    setThreadId(threadIdParam);
  }, [threadIdParam]);

  useEffect(() => {
    if (!threadIdParam) return;
    setLoadingThread(true);
    setError("");
    fetchThreadDetail(threadIdParam)
      .then((thread) => {
        setMessages(
          thread.messages.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
            citations: m.citations ?? undefined,
          }))
        );
        setSelectedIds(new Set(thread.paper_ids));
        setThreadId(thread.id);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Unable to load this conversation right now.");
      })
      .finally(() => setLoadingThread(false));
  }, [threadIdParam]);

  // Open the PDF pane for a specific paper/page
  const openPdf = useCallback(async (paperId: string, page = 1) => {
    setError("");
    try {
      const blob = await fetchPaperPdfBlob(paperId);
      const nextUrl = URL.createObjectURL(blob);
      setActivePdfUrl((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        activeBlobUrlRef.current = nextUrl;
        return nextUrl;
      });
      const paper = papers.find((p) => p.id === paperId);
      setActivePdfTitle(paper?.title || paper?.filename || "Paper");
      setActivePage(page);
      setIsPdfOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load the paper PDF.");
    }
  }, [papers]);

  // Citation click: find paper by filename, open at page
  const handleCitationClick = useCallback(
    async (source: string, page: number) => {
      const sourceBasename = basename(source);
      const pageNum = typeof page === "number" && Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
      const paper = papers.find(
        (p) => p.filename === source || basename(p.filename) === sourceBasename
      );
      if (paper) await openPdf(paper.id, pageNum);
    },
    [papers, openPdf]
  );

  const handleClosePdf = useCallback(() => {
    setActivePdfUrl((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      activeBlobUrlRef.current = null;
      return null;
    });
    setActivePage(1);
    setIsPdfOpen(false);
  }, []);

  useEffect(() => {
    return () => {
      if (activeBlobUrlRef.current) URL.revokeObjectURL(activeBlobUrlRef.current);
    };
  }, []);

  const paperIds = Array.from(selectedIds);
  const pdfSrc = activePdfUrl ? `${activePdfUrl}#page=${activePage}` : null;

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">

      {/* ══════════════ LEFT PANE: Folder & Knowledge Base ══════════════ */}
      <ContextDrawer
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        papers={papers}
        onPapersChange={setPapers}
        draggedPaperId={draggedPaperId}
        onDragStart={setDraggedPaperId}
        onDragEnd={() => setDraggedPaperId(null)}
        onPreviewPaper={(id) => openPdf(id, 1)}
      />

      {/* ══════════════ CENTER PANE: Chat ══════════════ */}
      <div className="flex min-h-0 flex-1 flex-col bg-[var(--background)]">
        {error && (
          <div className="flex-shrink-0 px-4 pt-3">
            <ErrorAlert message={error} />
          </div>
        )}

        {loadingThread ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
          </div>
        ) : (
          <ChatWindow
            messages={messages}
            onMessagesChange={setMessages}
            paperIds={paperIds}
            threadId={threadId}
            onThreadIdChange={setThreadId}
            onCitationClick={handleCitationClick}
            onError={setError}
            selectedIds={selectedIds}
            onRemoveFromContext={(id) => {
              const next = new Set(selectedIds);
              next.delete(id);
              setSelectedIds(next);
            }}
            papers={papers}
            draggedPaperId={draggedPaperId}
            onDropPaper={(id) => {
              const next = new Set(selectedIds);
              next.add(id);
              setSelectedIds(next);
              setDraggedPaperId(null);
            }}
          />
        )}
      </div>

      {/* ══════════════ RIGHT PANE: PDF Viewer (slide-in) ══════════════ */}
      <div
        className={`flex flex-shrink-0 flex-col border-l border-[var(--border)] bg-[var(--surface-elevated)] transition-all duration-300 ease-in-out ${
          isPdfOpen ? "w-[42%] opacity-100" : "w-0 opacity-0 overflow-hidden"
        }`}
      >
        {isPdfOpen && (
          <>
            {/* PDF pane header */}
            <div className="flex flex-shrink-0 items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <FileText className="h-4 w-4 flex-shrink-0 text-[var(--primary)]" />
                <p className="truncate text-sm font-medium text-[var(--foreground)]" title={activePdfTitle}>
                  {activePdfTitle}
                </p>
              </div>
              <button
                type="button"
                onClick={handleClosePdf}
                className="ml-3 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-[var(--muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
                aria-label="Close PDF viewer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* PDF iframe */}
            <div className="min-h-0 flex-1 p-3">
              {pdfSrc ? (
                <iframe
                  key={`${activePdfUrl}-p${activePage}`}
                  src={pdfSrc}
                  title="Research paper PDF"
                  className="h-full w-full rounded-xl border border-[var(--border)]"
                />
              ) : (
                <div className="flex h-full items-center justify-center rounded-xl border-2 border-dashed border-[var(--border)]">
                  <p className="text-sm text-[var(--muted)]">Loading PDF…</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function ChatWorkspacePage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-0 flex-1 items-center justify-center text-[var(--muted)]">Loading…</div>
    }>
      <ChatContent />
    </Suspense>
  );
}

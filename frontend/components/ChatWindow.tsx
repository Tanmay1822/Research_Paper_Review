"use client";

import { FileText, Loader2, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { chat } from "@/utils/api";
import type { Citation } from "@/utils/api";
import type { PaperWithUrl } from "@/components/ContextDrawer";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
}

interface ChatWindowProps {
  messages: ChatMessage[];
  onMessagesChange: (messages: ChatMessage[]) => void;
  paperIds: string[];
  threadId: string | null;
  onThreadIdChange: (id: string | null) => void;
  onCitationClick: (source: string, page: number) => void;
  onError: (message: string) => void;
  // Context chips
  selectedIds: Set<string>;
  onRemoveFromContext: (id: string) => void;
  papers: PaperWithUrl[];
  // Drag-and-drop from left sidebar
  draggedPaperId: string | null;
  onDropPaper: (id: string) => void;
}

export default function ChatWindow({
  messages,
  onMessagesChange,
  paperIds,
  threadId,
  onThreadIdChange,
  onCitationClick,
  onError,
  selectedIds,
  onRemoveFromContext,
  papers,
  draggedPaperId,
  onDropPaper,
}: ChatWindowProps) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [dropzoneActive, setDropzoneActive] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Auto-grow textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = input.trim();
    if (!q || loading || paperIds.length === 0) return;
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    onError("");
    onMessagesChange([...messages, { role: "user", content: q }]);
    setLoading(true);
    try {
      const res = await chat(q, paperIds, threadId ?? undefined);
      if (res.thread_id) onThreadIdChange(res.thread_id);
      onMessagesChange([
        ...messages,
        { role: "user", content: q },
        { role: "assistant", content: res.answer, citations: res.citations },
      ]);
    } catch (e) {
      onError(e instanceof Error ? e.message : "We could not send your message right now.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Drag-and-drop onto the context dropzone
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (draggedPaperId) setDropzoneActive(true);
  };
  const handleDragLeave = () => setDropzoneActive(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDropzoneActive(false);
    const id = e.dataTransfer.getData("paperId") || draggedPaperId;
    if (id) onDropPaper(id);
  };

  const selectedPapers = papers.filter((p) => selectedIds.has(p.id));

  return (
    <div className="flex min-h-0 flex-1 flex-col">

      {/* ── Active Context Dropzone (top of center pane) ── */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`flex-shrink-0 border-b px-4 py-3 transition-all duration-150 ${
          dropzoneActive
            ? "border-yellow-400/40 bg-yellow-400/5"
            : "border-white/5 bg-[#1a2329]"
        }`}
      >
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-600">
          Active Context
        </p>

        {selectedPapers.length === 0 ? (
          <div
            className={`flex items-center gap-2 rounded-xl border-2 border-dashed px-4 py-3 transition-colors ${
              dropzoneActive ? "border-yellow-400/50" : "border-white/10"
            }`}
          >
            <FileText className="h-4 w-4 text-gray-700" />
            <p className="text-xs text-gray-600">
              {dropzoneActive
                ? "Drop to add paper to context"
                : "Drag papers here or use + in the sidebar"}
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {selectedPapers.map((p) => (
              <span
                key={p.id}
                className="inline-flex items-center gap-1.5 rounded-lg border border-yellow-400/20 bg-yellow-400/10 py-1 pl-2.5 pr-1.5 text-xs font-medium text-yellow-300"
              >
                <FileText className="h-3 w-3 text-yellow-400/70" />
                <span className="max-w-[160px] truncate" title={p.title || p.filename}>
                  {p.title || p.filename}
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveFromContext(p.id)}
                  className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-md text-yellow-400/60 hover:bg-yellow-400/20 hover:text-yellow-300"
                  aria-label="Remove from context"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {/* Drop-more hint when dragging */}
            {dropzoneActive && (
              <span className="inline-flex items-center gap-1 rounded-lg border-2 border-dashed border-yellow-400/40 px-3 py-1 text-xs text-yellow-400/60">
                + Drop here
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Messages ── */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-yellow-400/10">
              <FileText className="h-8 w-8 text-yellow-400/60" />
            </div>
            <p className="text-base font-semibold text-gray-400">Ask anything about your papers</p>
            <p className="mt-1 text-sm text-gray-600">
              {paperIds.length === 0
                ? "Add papers to context using the sidebar →"
                : "Citations will open the PDF in the right panel"}
            </p>
          </div>
        )}

        <div className="space-y-6">
          {messages.map((m, i) => (
            <MessageBubble
              key={i}
              message={m}
              onCitationClick={onCitationClick}
            />
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="flex items-center gap-3 rounded-2xl border border-white/5 bg-[#1a2329] px-4 py-3">
                <Loader2 className="h-4 w-4 animate-spin text-yellow-400" />
                <span className="text-sm text-gray-500">Thinking…</span>
              </div>
            </div>
          )}
        </div>
        <div ref={bottomRef} />
      </div>

      {/* ── Input Bar ── */}
      <div className="flex-shrink-0 px-4 pb-4 pt-2">
        <form
          onSubmit={handleSubmit}
          className="flex items-end gap-2 rounded-2xl border border-white/10 bg-[#1a2329] px-4 py-3 shadow-lg ring-1 ring-white/5 transition-all focus-within:border-yellow-400/30 focus-within:ring-yellow-400/10"
        >
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={
              paperIds.length === 0
                ? "Add papers to context first…"
                : "Ask a question… (Enter to send, Shift+Enter for newline)"
            }
            disabled={paperIds.length === 0 || loading}
            className="min-h-[36px] flex-1 resize-none bg-transparent text-sm text-white placeholder-gray-600 focus:outline-none disabled:opacity-40"
            suppressHydrationWarning
          />
          <button
            type="submit"
            disabled={!input.trim() || paperIds.length === 0 || loading}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-yellow-400 text-[#131b20] transition-all hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-40"
            suppressHydrationWarning
            aria-label="Send message"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ── Message Bubble ── */
function MessageBubble({
  message,
  onCitationClick,
}: {
  message: ChatMessage;
  onCitationClick: (source: string, page: number) => void;
}) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-yellow-400/15 px-4 py-3 ring-1 ring-yellow-400/20">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-yellow-50">
            {message.content}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] space-y-3">
        {/* AI label */}
        <p className="ml-1 text-[10px] font-semibold uppercase tracking-wider text-gray-700">
          Research Assistant
        </p>
        <div className="rounded-2xl rounded-tl-sm border border-white/5 bg-[#1a2329] px-4 py-3 shadow-md">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-200">
            {message.content}
          </p>

          {/* Citation badges */}
          {message.citations && message.citations.length > 0 && (
            <div className="mt-4 border-t border-white/5 pt-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-700">
                Sources
              </p>
              <div className="flex flex-wrap gap-2">
                {message.citations.map((c, j) => (
                  <button
                    key={j}
                    onClick={() => onCitationClick(c.source, c.page)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-yellow-400/20 bg-yellow-400/10 px-2.5 py-1 text-xs font-medium text-yellow-300 transition-all hover:border-yellow-400/40 hover:bg-yellow-400/20 hover:shadow-[0_0_8px_rgba(250,204,21,0.2)]"
                  >
                    <FileText className="h-3 w-3" />
                    {c.source} p.{c.page}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

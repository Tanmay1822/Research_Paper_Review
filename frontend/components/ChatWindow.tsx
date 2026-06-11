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
  suggestedQuestions?: string[];
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

  const sendMessage = async (q: string) => {
    if (!q || loading || paperIds.length === 0) return;
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    onError("");
    const withUser = [...messages, { role: "user" as const, content: q }];
    onMessagesChange(withUser);
    setLoading(true);
    try {
      const res = await chat(q, paperIds, threadId ?? undefined);
      if (res.thread_id) onThreadIdChange(res.thread_id);
      onMessagesChange([
        ...withUser,
        {
          role: "assistant" as const,
          content: res.answer,
          citations: res.citations,
          suggestedQuestions: res.suggested_questions ?? [],
        },
      ]);
    } catch (e) {
      onError(e instanceof Error ? e.message : "We could not send your message right now.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    sendMessage(input.trim());
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
            ? "border-[var(--primary)]/40 bg-[var(--primary)]/10"
            : "border-[var(--border)] bg-[var(--surface-elevated)]"
        }`}
      >
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
          Active Context
        </p>

        {selectedPapers.length === 0 ? (
          <div
            className={`flex items-center gap-2 rounded-xl border-2 border-dashed px-4 py-3 transition-colors ${
              dropzoneActive ? "border-[var(--primary)]/50" : "border-[var(--border)]"
            }`}
          >
            <FileText className="h-4 w-4 text-[var(--muted)]" />
            <p className="text-xs text-[var(--muted)]">
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
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--primary)]/35 bg-[var(--accent)]/55 py-1 pl-2.5 pr-1.5 text-xs font-medium text-[var(--foreground)]"
              >
                <FileText className="h-3 w-3 text-[var(--cta)]" />
                <span className="max-w-[160px] truncate" title={p.title || p.filename}>
                  {p.title || p.filename}
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveFromContext(p.id)}
                  className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-md text-[var(--cta)]/80 hover:bg-[var(--primary)]/20 hover:text-[var(--foreground)]"
                  aria-label="Remove from context"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {/* Drop-more hint when dragging */}
            {dropzoneActive && (
              <span className="inline-flex items-center gap-1 rounded-lg border-2 border-dashed border-[var(--primary)]/45 px-3 py-1 text-xs text-[var(--muted)]">
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
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--accent)]/60">
              <FileText className="h-8 w-8 text-[var(--cta)]" />
            </div>
            <p className="text-base font-semibold text-[var(--foreground)]">Ask anything about your papers</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {paperIds.length === 0
                ? "Add papers to context using the sidebar →"
                : "Citations will open the PDF in the right panel"}
            </p>
          </div>
        )}

        <div className="space-y-6">
          {messages.map((m, i) => {
            const isLastAssistant =
              m.role === "assistant" && i === messages.length - 1 && !loading;
            return (
              <MessageBubble
                key={i}
                message={m}
                onCitationClick={onCitationClick}
                onSuggestedQuestion={isLastAssistant ? sendMessage : undefined}
              />
            );
          })}

          {loading && (
            <div className="flex justify-start">
              <div className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-3">
                <Loader2 className="h-4 w-4 animate-spin text-[var(--cta)]" />
                <span className="text-sm text-[var(--muted)]">Thinking…</span>
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
          className="flex items-end gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-3 shadow-sm ring-1 ring-[var(--accent)]/50 transition-all focus-within:border-[var(--cta)]/30 focus-within:ring-[var(--cta)]/15"
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
            className="min-h-[36px] flex-1 resize-none bg-transparent text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none disabled:opacity-40"
            suppressHydrationWarning
          />
          <button
            type="submit"
            disabled={!input.trim() || paperIds.length === 0 || loading}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--primary)] text-[var(--foreground)] transition-all hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-40"
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
  onSuggestedQuestion,
}: {
  message: ChatMessage;
  onCitationClick: (source: string, page: number) => void;
  onSuggestedQuestion?: (q: string) => void;
}) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-[var(--primary)]/16 px-4 py-3 ring-1 ring-[var(--primary)]/30">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--foreground)]">
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
        <p className="ml-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
          Research Assistant
        </p>
        <div className="rounded-2xl rounded-tl-sm border border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-3 shadow-md">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--foreground)]">
            {message.content}
          </p>

          {/* Citation badges */}
          {message.citations && message.citations.length > 0 && (
            <div className="mt-4 border-t border-[var(--border)] pt-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                Sources
              </p>
              <div className="flex flex-wrap gap-2">
                {message.citations.map((c, j) => (
                  <button
                    key={j}
                    onClick={() => onCitationClick(c.source, c.page)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--primary)]/30 bg-[var(--accent)]/55 px-2.5 py-1 text-xs font-medium text-[var(--foreground)] transition-all hover:border-[var(--primary)]/50 hover:bg-[var(--accent)]/75"
                  >
                    <FileText className="h-3 w-3" />
                    {c.source} p.{c.page}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Follow-up question chips */}
        {onSuggestedQuestion && message.suggestedQuestions && message.suggestedQuestions.length > 0 && (
          <div className="mt-2 flex flex-col gap-1.5">
            {message.suggestedQuestions.map((q, i) => (
              <button
                key={i}
                onClick={() => onSuggestedQuestion(q)}
                className="w-fit rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-left text-xs text-[var(--muted)] transition-all hover:border-[var(--primary)]/35 hover:bg-[var(--accent)]/50 hover:text-[var(--foreground)]"
              >
                {q}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

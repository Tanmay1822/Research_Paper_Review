"use client";

import { Loader2, Send } from "lucide-react";
import { useState } from "react";
import { chat, Citation } from "@/utils/api";
import type { Paper } from "./Sidebar";

interface Message {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
}

interface ChatInterfaceProps {
  papers: Paper[];
  onCitationClick?: (source: string, page: number) => void;
}

export default function ChatInterface({
  papers,
  onCitationClick,
}: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const paperIds = papers.map((p) => p.id);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = input.trim();
    if (!q || loading || paperIds.length === 0) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: q }]);
    setLoading(true);
    try {
      const res = await chat(q, paperIds);
      setMessages((m) => [
        ...m,
        { role: "assistant", content: res.answer, citations: res.citations },
      ]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: `Error: ${e instanceof Error ? e.message : "Request failed"}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-[var(--surface-elevated)]">
      <div className="border-b border-[var(--border)] p-3">
        <h2 className="text-sm font-semibold text-[var(--foreground)]">Chat</h2>
        {paperIds.length === 0 && (
          <p className="text-xs text-[var(--muted)]">Upload papers to chat.</p>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <p className="py-8 text-center text-sm text-[var(--muted)]">
            Ask a question about your uploaded papers.
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 ${
                m.role === "user"
                  ? "bg-[var(--primary)] text-[var(--foreground)]"
                  : "bg-[var(--surface)] text-[var(--foreground)]"
              }`}
            >
              <p className="text-sm whitespace-pre-wrap">{m.content}</p>
              {m.citations && m.citations.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {m.citations.map((c, j) => (
                    <button
                      key={j}
                      onClick={() => onCitationClick?.(c.source, c.page)}
                      className="cursor-pointer rounded bg-[var(--accent)] px-2 py-1 text-xs text-[var(--foreground)] transition-all duration-150 hover:bg-[var(--surface)] hover:ring-2 hover:ring-[var(--primary)]/40"
                    >
                      [{c.source} p.{c.page}]
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-lg bg-[var(--surface)] px-3 py-2">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--muted)]" />
            </div>
          </div>
        )}
      </div>
      <form onSubmit={handleSubmit} className="border-t border-[var(--border)] p-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question..."
            disabled={paperIds.length === 0 || loading}
            className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/35 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || paperIds.length === 0 || loading}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-[var(--foreground)] hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </form>
    </div>
  );
}

"use client";

import { Check, FileText, GitFork, Loader2, Network, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ErrorAlert from "@/components/ErrorAlert";
import { fetchCitationNetwork, fetchPapers } from "@/utils/api";
import type { CitationNetwork, NetworkNode, PaperListItem } from "@/utils/api";

const CATEGORY_COLORS: Record<string, string> = {
  Review: "#d59d80",
  Empirical: "#104c64",
  Theoretical: "#c0754d",
};

function nodeColor(category: string | null) {
  return CATEGORY_COLORS[category ?? ""] ?? "#b6410f";
}

function buildLayout(nodes: NetworkNode[], width: number, height: number) {
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(cx, cy) * 0.68;
  return nodes.map((n, i) => {
    const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
    return { ...n, x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });
}

export default function NetworkPage() {
  const [papers, setPapers] = useState<PaperListItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);
  const [network, setNetwork] = useState<CitationNetwork | null>(null);
  const [error, setError] = useState("");
  const [hovered, setHovered] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; node: NetworkNode } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dims, setDims] = useState({ w: 800, h: 560 });

  useEffect(() => {
    fetchPapers()
      .then((list) => setPapers(list.filter((p) => p.status === "completed")))
      .catch(() => setError("Unable to load papers."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const el = svgRef.current?.parentElement;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDims({ w: Math.max(400, width), h: Math.max(360, height) });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const togglePaper = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const build = async () => {
    const ids = Array.from(selected);
    if (ids.length < 2) return;
    setBuilding(true);
    setError("");
    setNetwork(null);
    try {
      const net = await fetchCitationNetwork(ids);
      setNetwork(net);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to build network.");
    } finally {
      setBuilding(false);
    }
  };

  const laid = network ? buildLayout(network.nodes, dims.w, dims.h) : [];
  const nodeMap = Object.fromEntries(laid.map((n) => [n.id, n]));

  const isConnected = (id: string) => {
    if (!hovered || !network) return true;
    if (id === hovered) return true;
    return network.edges.some(
      (e) => (e.source === hovered && e.target === id) || (e.target === hovered && e.source === id)
    );
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left sidebar: paper selection ── */}
      <div className="flex w-72 flex-shrink-0 flex-col border-r border-[var(--accent)] bg-[var(--nav-bg)] p-5">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)]/70 ring-1 ring-[var(--cta)]/25">
            <Network className="h-4 w-4 text-[var(--cta)]" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-[var(--nav-fg)]">Citation Network</h1>
            <p className="text-[10px] text-[var(--nav-fg)]/80">Select ≥ 2 papers</p>
          </div>
        </div>

        {error && <ErrorAlert message={error} />}

        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]/65" />
          </div>
        ) : (
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
            {papers.length === 0 ? (
              <p className="py-8 text-center text-xs text-[var(--muted)]">No completed papers yet.</p>
            ) : (
              papers.map((p) => {
                const sel = selected.has(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => togglePaper(p.id)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all ${
                      sel ? "bg-[var(--accent)]/70 ring-1 ring-[var(--cta)]/25" : "hover:bg-[var(--surface)]"
                    }`}
                  >
                    <div
                      className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border transition-all ${
                        sel ? "border-[var(--cta)] bg-[var(--cta)]" : "border-[var(--border)]"
                      }`}
                    >
                      {sel && <Check className="h-3 w-3 text-[var(--surface-elevated)]" />}
                    </div>
                    <FileText className="h-4 w-4 flex-shrink-0 text-[var(--nav-fg)]/85" />
                    <p className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--nav-fg)]" title={p.title || p.filename}>
                      {p.title || p.filename}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        )}

        <div className="mt-4 flex-shrink-0 space-y-2">
          {/* Legend */}
          <div className="rounded-xl border border-[var(--accent)]/70 bg-[var(--cta)]/15 px-3 py-2.5">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--nav-fg)]">Legend</p>
            {Object.entries(CATEGORY_COLORS).map(([label, color]) => (
              <div key={label} className="flex items-center gap-2 py-0.5">
                <div className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
                <span className="text-[10px] text-[var(--nav-fg)]">{label}</span>
              </div>
            ))}
            <div className="flex items-center gap-2 py-0.5">
              <div className="h-0.5 w-5 rounded-full bg-[var(--cta)]" />
              <span className="text-[10px] text-[var(--nav-fg)]">Cites</span>
            </div>
          </div>

          <button
            onClick={build}
            disabled={selected.size < 2 || building}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-[var(--foreground)] shadow-sm transition-all hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          >
            {building ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Building…</>
            ) : (
              <><GitFork className="h-4 w-4" /> Build Network</>
            )}
          </button>
        </div>
      </div>

      {/* ── Right: SVG canvas ── */}
      <div className="relative min-h-0 flex-1 overflow-hidden bg-[var(--background)]">
        {!network && !building && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Network className="mb-4 h-16 w-16 text-[var(--cta)]/25" />
            <p className="text-base font-semibold text-[var(--foreground)]">Select papers and click Build Network</p>
            <p className="mt-1 text-sm text-[var(--muted)]">The graph shows citation relationships between papers</p>
          </div>
        )}

        {building && (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)]" />
            <p className="text-sm text-[var(--muted)]">Parsing references and building graph…</p>
          </div>
        )}

        {network && !building && (
          <>
            {/* Edge/node count */}
            <div className="absolute left-4 top-4 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)]/90 px-3 py-1.5 backdrop-blur-sm">
              <p className="text-xs text-[var(--muted)]">
                <span className="font-medium text-[var(--foreground)]">{network.nodes.length}</span> papers ·{" "}
                <span className="font-medium text-[var(--foreground)]">{network.edges.length}</span> citation links
              </p>
              {network.edges.length === 0 && (
                <p className="mt-0.5 text-[10px] text-[var(--muted)]">No direct citations detected between selected papers</p>
              )}
            </div>

            <svg
              ref={svgRef}
              width="100%"
              height="100%"
              className="absolute inset-0"
              viewBox={`0 0 ${dims.w} ${dims.h}`}
            >
              <defs>
                <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <path d="M0,0 L6,3 L0,6 Z" fill="rgba(192,117,77,0.6)" />
                </marker>
              </defs>

              {/* Edges */}
              {network.edges.map((edge, i) => {
                const src = nodeMap[edge.source];
                const tgt = nodeMap[edge.target];
                if (!src || !tgt) return null;
                const active = !hovered || (hovered === edge.source || hovered === edge.target);
                // Slight curve
                const mx = (src.x + tgt.x) / 2;
                const my = (src.y + tgt.y) / 2;
                const dx = tgt.y - src.y;
                const dy = src.x - tgt.x;
                const len = Math.sqrt(dx * dx + dy * dy) || 1;
                const bend = 30;
                const cpx = mx + (dx / len) * bend;
                const cpy = my + (dy / len) * bend;
                return (
                  <path
                    key={i}
                    d={`M${src.x},${src.y} Q${cpx},${cpy} ${tgt.x},${tgt.y}`}
                    fill="none"
                    stroke={active ? "rgba(192,117,77,0.65)" : "rgba(192,117,77,0.28)"}
                    strokeWidth={active ? 1.5 : 1}
                    markerEnd="url(#arrow)"
                    className="transition-all duration-200"
                  />
                );
              })}

              {/* Nodes */}
              {laid.map((node) => {
                const connected = isConnected(node.id);
                const color = nodeColor(node.category);
                const isHov = hovered === node.id;
                const r = isHov ? 20 : 15;
                return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x},${node.y})`}
                    className="cursor-pointer"
                    onMouseEnter={(e) => {
                      setHovered(node.id);
                      const svg = svgRef.current;
                      if (svg) {
                        const rect = svg.getBoundingClientRect();
                        setTooltip({ x: e.clientX - rect.left + 12, y: e.clientY - rect.top - 8, node });
                      }
                    }}
                    onMouseLeave={() => { setHovered(null); setTooltip(null); }}
                  >
                    <circle
                      r={r + 4}
                      fill={color}
                      opacity={isHov ? 0.15 : 0}
                      className="transition-all duration-150"
                    />
                    <circle
                      r={r}
                      fill={color}
                      opacity={connected ? (isHov ? 1 : 0.85) : 0.2}
                      stroke={isHov ? "rgba(13,29,37,0.9)" : "rgba(13,29,37,0.35)"}
                      strokeWidth={isHov ? 2 : 1}
                      className="transition-all duration-150"
                    />
                    <text
                      textAnchor="middle"
                      dy="0.35em"
                      fontSize={isHov ? 9 : 7}
                      fill={connected ? "rgba(13,29,37,0.9)" : "rgba(13,29,37,0.4)"}
                      fontWeight="bold"
                      className="select-none pointer-events-none transition-all duration-150"
                    >
                      {node.title.slice(0, isHov ? 10 : 8)}
                    </text>
                    {/* Label below node */}
                    <text
                      y={r + 14}
                      textAnchor="middle"
                      fontSize={9}
                      fill={connected ? "rgba(13,29,37,0.75)" : "rgba(13,29,37,0.45)"}
                      className="select-none pointer-events-none transition-all duration-150"
                    >
                      {node.title.length > 22 ? node.title.slice(0, 22) + "…" : node.title}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Tooltip */}
            {tooltip && (
              <div
                className="pointer-events-none absolute z-10 max-w-[220px] rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)]/95 px-3 py-2 shadow-xl backdrop-blur-sm"
                style={{ left: tooltip.x, top: tooltip.y }}
              >
                <p className="text-xs font-semibold text-[var(--foreground)]">{tooltip.node.title}</p>
                <p className="mt-0.5 text-[10px] text-[var(--muted)]">{tooltip.node.filename}</p>
                {tooltip.node.category && (
                  <span
                    className="mt-1 inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-medium"
                    style={{ background: `${nodeColor(tooltip.node.category)}20`, color: nodeColor(tooltip.node.category) }}
                  >
                    {tooltip.node.category}
                  </span>
                )}
                <p className="mt-1 text-[10px] text-[var(--muted)]">
                  {network!.edges.filter((e) => e.source === tooltip.node.id || e.target === tooltip.node.id).length} citation links
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface UploadResponse {
  id: string;
  filename: string;
  title: string | null;
  status: string;
  category: string;
  chunks_count: number;
}

export interface Citation {
  source: string;
  page: number;
  quote: string;
}

export interface ChatResponse {
  answer: string;
  citations: Citation[];
}

export interface ContradictionItem {
  topic: string;
  paper_A_claim: string;
  paper_B_claim: string;
  analysis: string;
}

export interface ContradictionReportResponse {
  agreements: string[];
  contradictions: ContradictionItem[];
}

export async function uploadPdf(file: File): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE}/api/upload`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    const msg = typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail ?? "Upload failed");
    throw new Error(msg);
  }
  return res.json();
}

export async function chat(query: string, paperIds: string[]): Promise<ChatResponse> {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, paper_ids: paperIds }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    const msg = typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail ?? "Chat failed");
    throw new Error(msg);
  }
  return res.json();
}

export async function analyzeContradictions(
  paperIds: string[]
): Promise<ContradictionReportResponse> {
  const res = await fetch(`${API_BASE}/api/analyze-contradictions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paper_ids: paperIds }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    const msg = typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail ?? "Analysis failed");
    throw new Error(msg);
  }
  return res.json();
}

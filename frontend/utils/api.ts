import { getAuthHeaders } from "./auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface AuthResponse {
  user_id: string;
  email: string;
}

export interface PaperListItem {
  id: string;
  filename: string;
  title: string | null;
  category: string;
  status: string;
  folder_id: string | null;
}

export interface PaperDetail extends PaperListItem {
  core_problem: string | null;
  methodology: string | null;
  dataset: string | null;
  results: string | null;
  limitations: string | null;
  authors: string | null;
}

export interface ThreadListItem {
  id: string;
  title: string;
  created_at: string;
}

export interface MessageItem {
  id: string;
  role: string;
  content: string;
  citations: Citation[] | null;
}

export interface ThreadDetailResponse {
  id: string;
  title: string;
  created_at: string;
  messages: MessageItem[];
  paper_ids: string[];
}

export interface UploadQueuedResponse {
  task_id: string;
  status: "queued";
}

export interface FolderItem {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  papers_count: number;
}

export interface UploadProcessingResult {
  id: string;
  filename: string;
  title: string;
  status: string;
  category: string;
  chunks_count: number;
}

export interface UploadStatusResponse {
  task_id: string;
  status: "processing" | "completed" | "failed";
  result?: UploadProcessingResult;
  error_code?: string;
  user_message?: string;
}

export interface Citation {
  source: string;
  page: number;
  quote: string;
}


export interface MatrixRow {
  id: string;
  title: string | null;
  filename: string;
  category: string;
  authors: string | null;
  core_problem: string | null;
  methodology: string | null;
  dataset: string | null;
  results: string | null;
  limitations: string | null;
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

export interface RelatedOnlinePaper {
  title: string;
  authors: string;
  year: string | null;
  venue: string | null;
  doi: string | null;
  url: string | null;
}

export interface RelatedOnlineResponse {
  source: string;
  query: string;
  papers: RelatedOnlinePaper[];
}

interface ApiErrorEnvelope {
  error_code?: string;
  user_message?: string;
  detail?: unknown;
}

function authHeaders(): HeadersInit {
  return getAuthHeaders();
}

function withAuth(init: RequestInit = {}): RequestInit {
  return {
    credentials: "include",
    ...init,
    headers: {
      ...(init.headers ?? {}),
      ...authHeaders(),
    },
  };
}

async function parseApiError(res: Response, fallbackMessage: string): Promise<Error> {
  const payload = (await res.json().catch(() => ({}))) as ApiErrorEnvelope;
  if (typeof payload.user_message === "string" && payload.user_message.trim()) {
    return new Error(payload.user_message);
  }
  if (typeof payload.detail === "string" && payload.detail.trim()) {
    return new Error(payload.detail);
  }
  return new Error(fallbackMessage);
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/api/auth/login`, withAuth({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }));
  if (!res.ok) {
    throw await parseApiError(res, "Unable to sign in right now. Please try again.");
  }
  return res.json();
}

export async function signup(email: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/api/auth/signup`, withAuth({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }));
  if (!res.ok) {
    throw await parseApiError(res, "Unable to create your account right now. Please try again.");
  }
  return res.json();
}

export async function fetchPapers(): Promise<PaperListItem[]> {
  const res = await fetch(`${API_BASE}/api/papers`, withAuth());
  if (!res.ok) {
    throw await parseApiError(res, "Unable to load your papers right now.");
  }
  return res.json();
}

export async function fetchPaperDetail(id: string): Promise<PaperDetail> {
  const res = await fetch(`${API_BASE}/api/papers/${id}`, withAuth());
  if (!res.ok) {
    throw await parseApiError(res, "Unable to load paper details right now.");
  }
  return res.json();
}

export async function fetchChatThreads(paperId?: string): Promise<ThreadListItem[]> {
  const url = paperId
    ? `${API_BASE}/api/chat/threads?paper_id=${paperId}`
    : `${API_BASE}/api/chat/threads`;
  const res = await fetch(url, withAuth());
  if (!res.ok) {
    throw await parseApiError(res, "Unable to load chat history right now.");
  }
  return res.json();
}

export async function fetchThreadDetail(threadId: string): Promise<ThreadDetailResponse> {
  const res = await fetch(`${API_BASE}/api/chat/threads/${threadId}`, withAuth());
  if (!res.ok) {
    throw await parseApiError(res, "Unable to load this conversation right now.");
  }
  return res.json();
}

export async function uploadPdf(file: File, folderId?: string | null): Promise<UploadQueuedResponse> {
  const formData = new FormData();
  formData.append("file", file);
  if (folderId) {
    formData.append("folder_id", folderId);
  }
  const res = await fetch(`${API_BASE}/api/upload`, withAuth({
    method: "POST",
    body: formData,
  }));
  if (!res.ok) {
    throw await parseApiError(res, "File processing failed, please try again.");
  }
  return res.json();
}

export async function fetchUploadStatus(taskId: string): Promise<UploadStatusResponse> {
  const res = await fetch(`${API_BASE}/api/upload/status/${taskId}`, withAuth());
  if (!res.ok) {
    throw await parseApiError(res, "Unable to check upload status right now.");
  }
  return res.json();
}

export async function fetchFolders(): Promise<FolderItem[]> {
  const res = await fetch(`${API_BASE}/api/folders`, withAuth());
  if (!res.ok) {
    throw await parseApiError(res, "Unable to load folders right now.");
  }
  return res.json();
}

export async function createFolder(name: string): Promise<FolderItem> {
  const res = await fetch(`${API_BASE}/api/folders`, withAuth({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  }));
  if (!res.ok) {
    throw await parseApiError(res, "Unable to create folder.");
  }
  return res.json();
}

export async function renameFolder(folderId: string, name: string): Promise<FolderItem> {
  const res = await fetch(`${API_BASE}/api/folders/${folderId}`, withAuth({
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  }));
  if (!res.ok) {
    throw await parseApiError(res, "Unable to rename folder.");
  }
  return res.json();
}

export async function deleteFolder(folderId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/folders/${folderId}`, withAuth({ method: "DELETE" }));
  if (!res.ok) {
    throw await parseApiError(res, "Unable to delete folder.");
  }
}

export async function movePaper(paperId: string, folderId: string | null): Promise<void> {
  const res = await fetch(`${API_BASE}/api/papers/${paperId}/move`, withAuth({
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folder_id: folderId }),
  }));
  if (!res.ok) {
    throw await parseApiError(res, "Unable to move paper.");
  }
}

export async function bulkDeletePapers(paperIds: string[]): Promise<number> {
  const res = await fetch(`${API_BASE}/api/papers/bulk-delete`, withAuth({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paper_ids: paperIds }),
  }));
  if (!res.ok) {
    throw await parseApiError(res, "Unable to delete selected papers.");
  }
  const payload = (await res.json()) as { deleted_count: number };
  return payload.deleted_count ?? 0;
}

export async function bulkExtractKnowledgeCards(paperIds: string[]): Promise<string[]> {
  const res = await fetch(`${API_BASE}/api/papers/bulk-extract`, withAuth({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paper_ids: paperIds }),
  }));
  if (!res.ok) {
    throw await parseApiError(res, "Unable to start bulk extraction.");
  }
  const payload = (await res.json()) as { task_ids: string[] };
  return payload.task_ids ?? [];
}

export interface ChatResponse {
  answer: string;
  citations: Citation[];
  thread_id?: string;
  suggested_questions?: string[];
}

export async function chat(
  query: string,
  paperIds: string[],
  threadId?: string
): Promise<ChatResponse> {
  const body: { query: string; paper_ids: string[]; thread_id?: string } = {
    query,
    paper_ids: paperIds,
  };
  if (threadId) body.thread_id = threadId;
  const res = await fetch(`${API_BASE}/api/chat`, withAuth({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
  if (!res.ok) {
    throw await parseApiError(res, "We could not send your message right now.");
  }
  return res.json();
}

export async function analyzeContradictions(
  paperIds: string[]
): Promise<ContradictionReportResponse> {
  const res = await fetch(`${API_BASE}/api/analyze-contradictions`, withAuth({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paper_ids: paperIds }),
  }));
  if (!res.ok) {
    throw await parseApiError(res, "Comparison failed. Please try again.");
  }
  return res.json();
}

export async function fetchCurrentUser(): Promise<{ id: string; email: string }> {
  const res = await fetch(`${API_BASE}/api/auth/me`, withAuth());
  if (!res.ok) {
    throw await parseApiError(res, "Unable to verify your session.");
  }
  return res.json();
}

export async function logout(): Promise<void> {
  const res = await fetch(`${API_BASE}/api/auth/logout`, withAuth({ method: "POST" }));
  if (!res.ok) {
    throw await parseApiError(res, "Unable to sign out right now.");
  }
}

export async function fetchPaperPdfBlob(paperId: string): Promise<Blob> {
  const res = await fetch(`${API_BASE}/api/papers/${paperId}/pdf`, withAuth());
  if (!res.ok) {
    throw await parseApiError(res, "Unable to load the paper PDF.");
  }
  return res.blob();
}

export async function fetchPaperBibtexBlob(paperId: string): Promise<Blob> {
  const res = await fetch(`${API_BASE}/api/papers/${paperId}/export-bibtex`, withAuth());
  if (!res.ok) {
    throw await parseApiError(res, "Unable to export BibTeX right now.");
  }
  return res.blob();
}

export async function fetchRelatedPapersOnline(paperId: string): Promise<RelatedOnlineResponse> {
  const res = await fetch(`${API_BASE}/api/papers/${paperId}/related-online`, withAuth());
  if (!res.ok) {
    throw await parseApiError(res, "Unable to fetch related papers from the internet.");
  }
  return res.json();
}

export async function fetchComparisonMatrix(paperIds: string[]): Promise<MatrixRow[]> {
  const res = await fetch(`${API_BASE}/api/papers/comparison-matrix`, withAuth({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paper_ids: paperIds }),
  }));
  if (!res.ok) {
    throw await parseApiError(res, "Unable to build comparison matrix.");
  }
  return res.json();
}

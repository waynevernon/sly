import type { AiProvider } from "../services/ai";

export type AssistantScope = "note" | "section" | "selection";

export interface AssistantProposal {
  id: string;
  title: string;
  summary: string;
  startLine: number;
  endLine: number;
  replacement: string;
}

export interface AssistantHistoryEntry {
  role: "user" | "assistant";
  text: string;
}

export interface AssistantTurnRequest {
  provider: AiProvider;
  noteId: string;
  notePath: string;
  noteTitle: string;
  scope: AssistantScope;
  scopeLabel: string;
  startLine: number;
  endLine: number;
  snapshotHash: string;
  numberedContent: string;
  userPrompt: string;
  history: AssistantHistoryEntry[];
  ollamaModel?: string;
}

export interface AssistantTurnResult {
  replyText: string;
  proposals: AssistantProposal[];
  warning?: string | null;
  executionDir?: string | null;
}

export interface AssistantUserTurn {
  id: string;
  kind: "user";
  text: string;
  createdAt: number;
  scope: AssistantScope;
  scopeLabel: string;
  lineLabel: string;
  snapshotHash: string;
  notice?: string;
}

export interface AssistantAssistantTurn {
  id: string;
  kind: "assistant";
  replyText: string;
  proposals: AssistantProposal[];
  createdAt: number;
  snapshotHash: string;
  snapshotMarkdown: string;
  scopeStartLine: number;
  scopeEndLine: number;
  warning?: string | null;
  executionDir?: string | null;
  stale?: boolean;
  invalidReason?: string | null;
  invalidProposalIds?: string[];
}

export interface AssistantSystemTurn {
  id: string;
  kind: "system";
  text: string;
  createdAt: number;
}

export type AssistantTurn =
  | AssistantUserTurn
  | AssistantAssistantTurn
  | AssistantSystemTurn;

export interface AssistantThreadState {
  provider: AiProvider;
  scope: AssistantScope;
  scopeManual: boolean;
  draft: string;
  turns: AssistantTurn[];
  pending: boolean;
  lastSuccessfulSnapshotHash: string | null;
}

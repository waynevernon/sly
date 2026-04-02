import { invoke } from "@tauri-apps/api/core";
import type { AssistantTurnRequest, AssistantTurnResult } from "../types/assistant";

export async function executeAssistantTurn(
  request: AssistantTurnRequest,
): Promise<AssistantTurnResult> {
  return invoke("ai_assistant_turn", { request });
}

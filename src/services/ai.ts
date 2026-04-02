import { invoke } from "@tauri-apps/api/core";

export type AiProvider = "claude" | "codex" | "opencode" | "ollama";
export const AI_PROVIDER_ORDER: ReadonlyArray<AiProvider> = [
  "claude",
  "codex",
  "opencode",
  "ollama",
];

export async function checkClaudeCli(): Promise<boolean> {
  return invoke("ai_check_claude_cli");
}

export async function checkCodexCli(): Promise<boolean> {
  return invoke("ai_check_codex_cli");
}

export async function checkOpenCodeCli(): Promise<boolean> {
  return invoke("ai_check_opencode_cli");
}

export async function checkOllamaCli(): Promise<boolean> {
  return invoke("ai_check_ollama_cli");
}

const providerCheckers: Record<AiProvider, () => Promise<boolean>> = {
  claude: checkClaudeCli,
  codex: checkCodexCli,
  opencode: checkOpenCodeCli,
  ollama: checkOllamaCli,
};

export async function getAvailableAiProviders(): Promise<AiProvider[]> {
  const checks = await Promise.all(
    AI_PROVIDER_ORDER.map(async (provider) => {
      try {
        const installed = await providerCheckers[provider]();
        return installed ? provider : null;
      } catch {
        return null;
      }
    }),
  );

  return checks.filter((provider): provider is AiProvider => provider !== null);
}

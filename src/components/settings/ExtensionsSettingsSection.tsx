import { useEffect, useReducer, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { Button, LoadingSpinner } from "../ui";
import {
  CheckIcon,
  ClaudeIcon,
  CodexIcon,
  OpenCodeIcon,
  OllamaIcon,
} from "../icons";
import { AI_PROVIDER_ORDER, type AiProvider } from "../../services/ai";
import * as cliService from "../../services/cli";
import type { CliStatus } from "../../services/cli";
import * as notesService from "../../services/notes";

type CliState = {
  status: CliStatus | null;
  loaded: boolean;
  error: boolean;
  operating: boolean;
};

type CliAction =
  | { type: "loaded"; status: CliStatus }
  | { type: "error" }
  | { type: "operating" }
  | { type: "operated"; status: CliStatus }
  | { type: "operate_failed" };

const cliInitialState: CliState = {
  status: null,
  loaded: false,
  error: false,
  operating: false,
};

function cliReducer(state: CliState, action: CliAction): CliState {
  switch (action.type) {
    case "loaded":
      return { ...state, status: action.status, loaded: true, error: false };
    case "error":
      return { ...state, error: true };
    case "operating":
      return { ...state, operating: true };
    case "operated":
      return { ...state, status: action.status, operating: false };
    case "operate_failed":
      return { ...state, operating: false };
  }
}

function CliUsageHint() {
  return (
    <p className="text-sm text-text-muted font-mono">
      sly file.md # open note
      <br />
      sly . # open folder
      <br />
      sly # launch app
    </p>
  );
}

const AI_PROVIDER_INFO: Record<
  AiProvider,
  {
    name: string;
    icon: React.ComponentType<{ className?: string }>;
    installUrl: string;
  }
> = {
  claude: {
    name: "Claude Code",
    icon: ClaudeIcon,
    installUrl: "https://code.claude.com/docs/en/quickstart",
  },
  codex: {
    name: "OpenAI Codex",
    icon: CodexIcon,
    installUrl: "https://github.com/openai/codex",
  },
  opencode: {
    name: "OpenCode",
    icon: OpenCodeIcon,
    installUrl: "https://opencode.ai",
  },
  ollama: {
    name: "Ollama",
    icon: OllamaIcon,
    installUrl: "https://ollama.com",
  },
};

interface ExtensionsSettingsSectionProps {
  aiProviders: AiProvider[];
  aiProvidersLoading: boolean;
  onRefreshAiProviders: () => Promise<void>;
}

export function ExtensionsSettingsSection({
  aiProviders,
  aiProvidersLoading,
  onRefreshAiProviders,
}: ExtensionsSettingsSectionProps) {
  const [cli, dispatchCli] = useReducer(cliReducer, cliInitialState);
  const [aiWorkingDirectory, setAiWorkingDirectory] = useState<string | null>(
    null,
  );
  const [aiWorkingDirectoryLoaded, setAiWorkingDirectoryLoaded] = useState(false);
  const [aiWorkingDirectorySaving, setAiWorkingDirectorySaving] = useState(false);

  useEffect(() => {
    cliService
      .getCliStatus()
      .then((status) => dispatchCli({ type: "loaded", status }))
      .catch((err) => {
        console.error("Failed to get CLI status:", err);
        dispatchCli({ type: "error" });
      });
  }, []);

  useEffect(() => {
    void onRefreshAiProviders();
  }, [onRefreshAiProviders]);

  useEffect(() => {
    notesService
      .getAiWorkingDirectory()
      .then((path) => {
        setAiWorkingDirectory(path);
        setAiWorkingDirectoryLoaded(true);
      })
      .catch((err) => {
        console.error("Failed to load AI reference folder:", err);
        setAiWorkingDirectoryLoaded(true);
      });
  }, []);

  const formatPath = (path: string | null): string => {
    if (!path) return "Notes folder";
    const maxLength = 56;
    if (path.length <= maxLength) return path;
    return `${path.slice(0, 24)}...${path.slice(-28)}`;
  };

  const saveAiWorkingDirectory = async (path: string | null) => {
    setAiWorkingDirectorySaving(true);
    try {
      const savedPath = await notesService.setAiWorkingDirectory(path);
      setAiWorkingDirectory(savedPath);
      return savedPath;
    } finally {
      setAiWorkingDirectorySaving(false);
    }
  };

  const handleSelectAiWorkingDirectory = async () => {
    try {
      const selected = await invoke<string | null>("open_folder_dialog", {
        defaultPath: aiWorkingDirectory,
      });

      if (!selected) return;

      await saveAiWorkingDirectory(selected);
      toast.success("AI reference folder updated.");
    } catch (err) {
      console.error("Failed to update AI reference folder:", err);
      toast.error(
        err instanceof Error ? err.message : "Failed to update AI reference folder",
      );
    }
  };

  const handleResetAiWorkingDirectory = async () => {
    try {
      await saveAiWorkingDirectory(null);
      toast.success("AI reference folder reset to notes folder.");
    } catch (err) {
      console.error("Failed to reset AI reference folder:", err);
      toast.error(
        err instanceof Error ? err.message : "Failed to reset AI reference folder",
      );
    }
  };

  const handleInstallCli = async () => {
    dispatchCli({ type: "operating" });
    try {
      await cliService.installCli();
      const status = await cliService.getCliStatus();
      await onRefreshAiProviders();
      dispatchCli({ type: "operated", status });
      toast.success("CLI tool installed. Open a new terminal to use `sly`.");
    } catch (err) {
      dispatchCli({ type: "operate_failed" });
      toast.error(
        err instanceof Error ? err.message : "Failed to install CLI tool",
      );
    }
  };

  const handleUninstallCli = async () => {
    dispatchCli({ type: "operating" });
    try {
      await cliService.uninstallCli();
      const status = await cliService.getCliStatus();
      await onRefreshAiProviders();
      dispatchCli({ type: "operated", status });
      toast.success("CLI tool uninstalled.");
    } catch (err) {
      dispatchCli({ type: "operate_failed" });
      toast.error(
        err instanceof Error ? err.message : "Failed to uninstall CLI tool",
      );
    }
  };

  return (
    <div className="space-y-10 pt-8 pb-10">
      {/* AI Providers */}
      <section className="space-y-4">
        <h2 className="text-xl font-medium mb-0.5">AI Providers</h2>
        <p className="text-sm text-text-muted mb-4">
          Use AI from the Assistant tab in the right panel while editing a
          note
        </p>

        {aiProvidersLoading ? (
          <div className="flex items-center gap-2 p-3">
            <LoadingSpinner size="md" tone="muted" />
            <span className="text-sm text-text-muted">
              Detecting installed providers...
            </span>
          </div>
        ) : (
          <div className="space-y-2">
            {AI_PROVIDER_ORDER.map((provider) => {
              const installed = aiProviders.includes(provider);
              const info = AI_PROVIDER_INFO[provider];
              return (
                <div
                  key={provider}
                  className="ui-settings-panel flex items-center justify-between p-3"
                >
                  <div className="flex items-center gap-2.5">
                    <info.icon className="w-4.5 h-4.5 text-text-muted" />
                    <span className="text-sm font-medium">{info.name}</span>
                  </div>
                  {installed ? (
                    <span className="flex items-center gap-1.25 text-sm text-text-muted">
                      Installed
                      <span className="h-4.5 w-4.5 bg-bg-emphasis rounded-full flex items-center justify-center">
                        <CheckIcon className="w-3 h-3 stroke-[2.2]" />
                      </span>
                    </span>
                  ) : (
                    <a
                      href={info.installUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-text font-medium hover:text-text-muted transition-colors cursor-pointer"
                    >
                      Install
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="ui-settings-separator" />

      <section className="space-y-4">
        <h2 className="text-xl font-medium mb-0.5">AI Reference Folder</h2>
        <p className="text-sm text-text-muted mb-4">
          Sly runs AI CLIs from this folder. Custom folders can affect files
          like <code className="ui-kbd font-mono">CLAUDE.md</code> and other
          repo-local instructions.
        </p>

        {!aiWorkingDirectoryLoaded ? (
          <div className="ui-settings-panel p-4 flex items-center justify-center">
            <LoadingSpinner size="lg" tone="muted" />
          </div>
        ) : (
          <>
            <div className="ui-settings-panel p-4 space-y-3 mb-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-text font-medium">Mode</span>
                <span className="text-sm text-text-muted">
                  {aiWorkingDirectory ? "Custom folder" : "Notes folder"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-text font-medium">Path</span>
                <span
                  className="text-sm text-text-muted truncate max-w-72 text-right"
                  title={aiWorkingDirectory || undefined}
                >
                  {formatPath(aiWorkingDirectory)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                onClick={handleSelectAiWorkingDirectory}
                disabled={aiWorkingDirectorySaving}
                variant="outline"
                size="md"
              >
                {aiWorkingDirectorySaving
                  ? "Saving..."
                  : aiWorkingDirectory
                    ? "Change Folder"
                    : "Choose Custom Folder"}
              </Button>
              {aiWorkingDirectory ? (
                <Button
                  onClick={handleResetAiWorkingDirectory}
                  disabled={aiWorkingDirectorySaving}
                  variant="outline"
                  size="md"
                >
                  Use Notes Folder
                </Button>
              ) : null}
            </div>
          </>
        )}
      </section>

      {/* CLI Tool (macOS only) */}
      {(cli.loaded && cli.status?.supported) || cli.error ? (
        <>
          <div className="ui-settings-separator" />

          <section className="space-y-4">
            <h2 className="text-xl font-medium mb-0.5">CLI Tool</h2>
            <p className="text-sm text-text-muted mb-4">
              Open notes from the terminal with the{" "}
              <code className="ui-kbd font-mono">
                sly
              </code>{" "}
              command
            </p>

            {cli.error ? (
              <div className="ui-status-panel-danger p-3">
                <p className="text-sm text-[var(--color-danger)]">
                  Failed to check CLI status. Please restart the app.
                </p>
              </div>
            ) : cli.status === null ? (
              <div className="ui-settings-panel p-4 flex items-center justify-center">
                <LoadingSpinner size="lg" tone="muted" />
              </div>
            ) : cli.status.installed ? (
              <>
                <div className="ui-settings-panel p-4 space-y-3 mb-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-text font-medium">
                      Status
                    </span>
                    <span className="text-sm text-text-muted">Installed</span>
                  </div>
                  {cli.status.path && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-text font-medium">
                        Path
                      </span>
                      <button
                        type="button"
                        className="ui-copy-chip max-w-48 truncate cursor-pointer"
                        title="Click to copy path"
                        onClick={async () => {
                          try {
                            await invoke("copy_to_clipboard", { text: cli.status!.path! });
                            toast.success("Path copied to clipboard");
                          } catch {
                            toast.error("Failed to copy path");
                          }
                        }}
                      >
                        {cli.status.path}
                      </button>
                    </div>
                  )}
                  <div className="pt-3 border-t border-border">
                    <CliUsageHint />
                  </div>
                </div>
                <Button
                  onClick={handleUninstallCli}
                  disabled={cli.operating}
                  variant="outline"
                  size="md"
                >
                  {cli.operating ? (
                    <>
                      <LoadingSpinner size="sm" tone="inherit" className="mr-2" />
                      Uninstalling...
                    </>
                  ) : (
                    "Uninstall CLI Tool"
                  )}
                </Button>
              </>
            ) : (
              <>
                <div className="ui-settings-panel flex items-center gap-2.5 p-3 mb-2.5">
                  <CliUsageHint />
                </div>
                <Button
                  onClick={handleInstallCli}
                  disabled={cli.operating}
                  variant="outline"
                  size="md"
                >
                  {cli.operating ? (
                    <>
                      <LoadingSpinner size="sm" tone="inherit" className="mr-2" />
                      Installing...
                    </>
                  ) : (
                    "Install CLI Tool"
                  )}
                </Button>
              </>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

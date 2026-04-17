import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { useGit } from "../../context/GitContext";
import { Button, Input, LoadingSpinner } from "../ui";
import { CloudPlusIcon, ExternalLinkIcon } from "../icons";

function formatRemoteUrl(url: string | null): string {
  if (!url) return "Connected";
  const sshMatch = url.match(/:([^/]+\/[^/]+?)(?:\.git)?$/);
  const httpsMatch = url.match(/\/([^/]+\/[^/]+?)(?:\.git)?$/);
  return sshMatch?.[1] || httpsMatch?.[1] || url;
}

function getRemoteWebUrl(url: string | null): string | null {
  if (!url) return null;
  const sshMatch = url.match(/^git@([^:]+):(.+?)(?:\.git)?$/);
  if (sshMatch) {
    return `https://${sshMatch[1]}/${sshMatch[2]}`;
  }
  const httpsMatch = url.match(/^(https?:\/\/.+?)(?:\.git)?$/);
  if (httpsMatch) {
    return httpsMatch[1];
  }
  return null;
}

export function GitSettingsSection() {
  const {
    status,
    gitAvailable,
    gitEnabled,
    isUpdatingGitEnabled,
    setGitEnabled,
    initRepo,
    isLoading,
    addRemote,
    pushWithUpstream,
    isAddingRemote,
    isPushing,
    lastError,
    clearError,
  } = useGit();

  const [remoteUrl, setRemoteUrl] = useState("");
  const [showRemoteInput, setShowRemoteInput] = useState(false);

  const handleOpenUrl = async (url: string) => {
    try {
      await invoke("open_url_safe", { url });
    } catch (err) {
      console.error("Failed to open URL:", err);
      toast.error(err instanceof Error ? err.message : "Failed to open URL");
    }
  };

  const handleAddRemote = async () => {
    if (isAddingRemote) return;
    if (!remoteUrl.trim()) return;
    const success = await addRemote(remoteUrl.trim());
    if (success) {
      setRemoteUrl("");
      setShowRemoteInput(false);
    }
  };

  const handleCancelRemote = () => {
    setShowRemoteInput(false);
    setRemoteUrl("");
    clearError();
  };

  const handleToggleGitEnabled = async (enabled: boolean) => {
    if (isUpdatingGitEnabled) return;

    const success = await setGitEnabled(enabled);
    if (!success) {
      toast.error("Failed to update version control setting");
      return;
    }

    if (!enabled) {
      setShowRemoteInput(false);
      setRemoteUrl("");
    }
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-6">
        <div className="flex flex-col gap-0.75">
          <h2 className="text-xl font-medium">Git</h2>
          <p className="text-sm text-text-muted max-w-lg">
            Track changes and store backups of your notes using Git
          </p>
        </div>
        <div className="ui-settings-toggle-group">
          <Button
            onClick={() => handleToggleGitEnabled(false)}
            variant={!gitEnabled ? "primary" : "ghost"}
            size="xs"
            disabled={isUpdatingGitEnabled}
          >
            Off
          </Button>
          <Button
            onClick={() => handleToggleGitEnabled(true)}
            variant={gitEnabled ? "primary" : "ghost"}
            size="xs"
            disabled={isUpdatingGitEnabled}
          >
            On
          </Button>
        </div>
      </div>

      {!gitEnabled ? null : !gitAvailable ? (
        <div className="ui-status-panel-warning p-4">
          <p className="text-sm text-text-muted">
            Git is not available on this system.{" "}
            <a
              href="https://git-scm.com/downloads"
              target="_blank"
              rel="noopener noreferrer"
              className="ui-inline-link"
            >
              Install Git
            </a>{" "}
            to enable version control.
          </p>
        </div>
      ) : isLoading ? (
        <div className="ui-settings-panel p-4 flex items-center justify-center">
          <LoadingSpinner size="lg" tone="muted" />
        </div>
      ) : !status?.isRepo ? (
        <div className="ui-settings-panel p-4">
          <p className="text-sm text-text-muted mb-3">
            Enable Git to track changes to your notes with version control. Your
            changes will be tracked automatically and you can commit and push
            from the sidebar.
          </p>
          <Button onClick={initRepo} disabled={isLoading} variant="outline" size="md">
            Initialize Git Repository
          </Button>
        </div>
      ) : (
        <div className="ui-settings-panel p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-text font-medium">Status</span>
            <span className="text-sm text-text-muted">
              {status.currentBranch ? `On branch ${status.currentBranch}` : "Git enabled"}
            </span>
          </div>

          {status.hasRemote ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm text-text font-medium">Remote</span>
                {getRemoteWebUrl(status.remoteUrl) ? (
                  <button
                    onClick={() => handleOpenUrl(getRemoteWebUrl(status.remoteUrl)!)}
                    className="flex items-center gap-0.75 text-sm text-text-muted hover:text-text truncate max-w-50 transition-colors cursor-pointer"
                    title={status.remoteUrl || undefined}
                  >
                    <span className="truncate">{formatRemoteUrl(status.remoteUrl)}</span>
                    <ExternalLinkIcon className="w-3.25 h-3.25 shrink-0" />
                  </button>
                ) : (
                  <span
                    className="text-sm text-text-muted truncate max-w-50"
                    title={status.remoteUrl || undefined}
                  >
                    {formatRemoteUrl(status.remoteUrl)}
                  </span>
                )}
              </div>

              {status.hasUpstream ? (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text font-medium">Tracking</span>
                  <span className="text-sm text-text-muted">origin/{status.currentBranch}</span>
                </div>
              ) : (
                status.currentBranch && (
                  <div className="pt-3 border-t border-border space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-text font-medium">Tracking</span>
                      <span className="text-sm font-medium text-[var(--color-warning)]">
                        Not set up
                      </span>
                    </div>
                    <p className="text-sm text-text-muted mb-2">
                      Push your commits and set up tracking for the "{status.currentBranch}"
                      {" "}branch.
                    </p>
                    <Button
                      onClick={() => void pushWithUpstream()}
                      disabled={isPushing}
                      size="sm"
                      className="mb-1.5"
                    >
                      {isPushing ? (
                        <>
                          <LoadingSpinner size="sm" tone="inherit" className="mr-2" />
                          Pushing...
                        </>
                      ) : (
                        `Push & track '${status.currentBranch}'`
                      )}
                    </Button>
                  </div>
                )
              )}
            </>
          ) : (
            <div className="pt-3 border-t border-border space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-text font-medium">Remote</span>
                <span className="text-sm font-medium text-[var(--color-warning)]">
                  Not connected
                </span>
              </div>

              {showRemoteInput ? (
                <div className="space-y-2">
                  <Input
                    type="text"
                    value={remoteUrl}
                    onChange={(e) => setRemoteUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleAddRemote();
                      if (e.key === "Escape") handleCancelRemote();
                    }}
                    placeholder="https://github.com/user/repo.git"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button
                      onClick={() => void handleAddRemote()}
                      disabled={isAddingRemote || !remoteUrl.trim()}
                      size="sm"
                    >
                      {isAddingRemote ? (
                        <>
                          <LoadingSpinner size="xs" tone="inherit" className="mr-2" />
                          Connecting...
                        </>
                      ) : (
                        "Connect"
                      )}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={handleCancelRemote}>
                      Cancel
                    </Button>
                  </div>
                  <RemoteInstructions />
                </div>
              ) : (
                <>
                  <Button
                    onClick={() => setShowRemoteInput(true)}
                    variant="outline"
                    size="md"
                  >
                    <CloudPlusIcon className="w-4 h-4 stroke-[1.7] mr-1.5" />
                    Add Remote
                  </Button>
                  <RemoteInstructions />
                </>
              )}
            </div>
          )}

          {status.changedCount > 0 && (
            <div className="flex items-center justify-between pt-3 border-t border-border">
              <span className="text-sm text-text font-medium">Changes to commit</span>
              <span className="text-sm text-text-muted">
                {status.changedCount} file{status.changedCount === 1 ? "" : "s"} changed
              </span>
            </div>
          )}

          {status.aheadCount > 0 && status.hasUpstream && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-text font-medium">Commits to push</span>
              <span className="text-sm text-text-muted">
                {status.aheadCount} commit{status.aheadCount === 1 ? "" : "s"}
              </span>
            </div>
          )}

          {status.behindCount > 0 && status.hasUpstream && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-text font-medium">Commits to pull</span>
              <span className="text-sm text-text-muted">
                {status.behindCount} commit{status.behindCount === 1 ? "" : "s"}
              </span>
            </div>
          )}

          {lastError && (
            <div className="pt-3 border-t border-border">
              <div className="ui-status-panel-danger p-3">
                <p className="text-sm text-[var(--color-danger)]">{lastError}</p>
                {(lastError.includes("Authentication") || lastError.includes("SSH")) && (
                  <a
                    href="https://docs.github.com/en/authentication/connecting-to-github-with-ssh"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-block text-xs text-[var(--color-danger)] underline"
                  >
                    Learn more about SSH authentication
                  </a>
                )}
                <Button
                  onClick={clearError}
                  variant="link"
                  className="block text-xs h-auto p-0 mt-2 text-[var(--color-danger)] hover:opacity-80"
                >
                  Dismiss
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function RemoteInstructions() {
  return (
    <div className="text-sm text-text-muted space-y-1.5 pt-2 pb-1.5">
      <p className="font-medium">To get your remote URL:</p>
      <ol className="list-decimal list-inside space-y-0.5 pl-1">
        <li>Create a repository on GitHub, GitLab, etc.</li>
        <li>Copy the repository URL (HTTPS or SSH)</li>
        <li>Click "Add Remote" and paste the URL</li>
      </ol>
      <p className="text-text-muted/70 pt-1">
        Example: https://github.com/username/my-notes.git
      </p>
    </div>
  );
}

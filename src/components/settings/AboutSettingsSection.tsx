import { useState, useEffect } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { showUpdateToast } from "../../App";
import { Button } from "../ui";
import { RefreshCwIcon, SpinnerIcon, GithubIcon } from "../icons";

export function AboutSettingsSection() {
  const [appVersion, setAppVersion] = useState<string>("");
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  useEffect(() => {
    getVersion()
      .then(setAppVersion)
      .catch(() => {});
  }, []);

  const handleCheckForUpdates = async () => {
    setCheckingUpdate(true);
    const result = await showUpdateToast();
    setCheckingUpdate(false);
    if (result === "no-update") {
      toast.success("You're on the latest version!");
    } else if (result === "error") {
      toast.error("Could not check for updates. Try again later.");
    }
  };

  const handleOpenUrl = async (url: string) => {
    try {
      await invoke("open_url_safe", { url });
    } catch (err) {
      console.error("Failed to open URL:", err);
      toast.error(err instanceof Error ? err.message : "Failed to open URL");
    }
  };

  return (
    <div className="space-y-10 pt-8 pb-10">
      {/* Version */}
      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-medium mb-0.5">Version</h2>
          <p className="text-sm text-text-muted">
            You are currently using Scratch v{appVersion || "..."}
          </p>
        </div>
        <Button
          onClick={handleCheckForUpdates}
          disabled={checkingUpdate}
          variant="outline"
          size="md"
          className="gap-1.25"
        >
          {checkingUpdate ? (
            <>
              <SpinnerIcon className="w-4.5 h-4.5 stroke-[1.5] animate-spin" />
              Checking...
            </>
          ) : (
            <>
              <RefreshCwIcon className="w-4.5 h-4.5 stroke-[1.5]" />
              Check for Updates
            </>
          )}
        </Button>
      </section>

      {/* Divider */}
      <div className="ui-settings-separator" />

      {/* About Section */}
      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-medium mb-1">About Scratch</h2>
          <p className="text-sm text-text-muted mb-4">
            Scratch is a minimalist markdown scratchpad for capturing quick
            thoughts, todos, and ideas. We're offline-first,
            keyboard-optimized, AI-compatible, and open source with no cloud,
            no accounts, and no subscriptions. Learn more on{" "}
            <button
              onClick={() => handleOpenUrl("https://www.ericli.io/scratch")}
              className="ui-inline-link cursor-pointer"
            >
              our website
            </button>
            .
          </p>
          <p className="text-sm text-text-muted">
            Created and maintained by{" "}
            <button
              onClick={() => handleOpenUrl("https://ericli.io")}
              className="ui-inline-link cursor-pointer"
            >
              Eric Li
            </button>{" "}
            with moral support from his cat, Mochi, and actual support from
            many contributors on GitHub.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => handleOpenUrl("https://github.com/erictli/scratch")}
            variant="outline"
            size="md"
            className="gap-1.25"
          >
            <GithubIcon className="w-4.5 h-4.5 stroke-[1.5]" />
            View on GitHub
          </Button>
          <Button
            onClick={() =>
              handleOpenUrl("https://github.com/erictli/scratch/issues")
            }
            variant="ghost"
            size="md"
            className="gap-1.25 text-text"
          >
            Submit Feedback
          </Button>
        </div>
      </section>
    </div>
  );
}

import { useState, useEffect } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { showUpdateToast } from "../../App";
import { Button, LoadingSpinner } from "../ui";
import { RefreshCwIcon, GithubIcon } from "../icons";

const REPOSITORY_URL = "https://github.com/waynevernon/sly";
const ISSUES_URL = "https://github.com/waynevernon/sly/issues";
const AUTHOR_URL = "https://github.com/waynevernon";
const UPSTREAM_URL = "https://github.com/erictli/scratch";

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
    const result = await showUpdateToast({ manual: true });
    setCheckingUpdate(false);
    if (result === "error") {
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
            You are currently using Sly v{appVersion || "..."}
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
              <LoadingSpinner size="lg" tone="inherit" />
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
          <h2 className="text-xl font-medium mb-1">About Sly</h2>
          <p className="text-sm text-text-muted mb-4">
            Sly is a local-first workspace for notes and tasks. It keeps your
            notes as plain markdown files on your own disk, brings structured
            task management into the same workspace, and adds optional AI and
            Git — without locking anything into a cloud service.
            Learn more in{" "}
            <button
              onClick={() => handleOpenUrl(REPOSITORY_URL)}
              className="ui-inline-link cursor-pointer"
            >
              the repository
            </button>
            .
          </p>
          <p className="text-sm text-text-muted">
            Sly is developed by{" "}
            <button
              onClick={() => handleOpenUrl(AUTHOR_URL)}
              className="ui-inline-link cursor-pointer"
            >
              Wayne Vernon
            </button>
            {" "}as an independent fork of{" "}
            <button
              onClick={() => handleOpenUrl(UPSTREAM_URL)}
              className="ui-inline-link cursor-pointer"
            >
              Scratch
            </button>
            , the original project created by Eric Li. Scratch&apos;s original
            work remains credited and respected under the MIT license.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => handleOpenUrl(REPOSITORY_URL)}
            variant="outline"
            size="md"
            className="gap-1.25"
          >
            <GithubIcon className="w-4.5 h-4.5 stroke-[1.5]" />
            View on GitHub
          </Button>
          <Button
            onClick={() => handleOpenUrl(ISSUES_URL)}
            variant="ghost"
            size="md"
            className="gap-1.25 text-text"
          >
            Report an Issue
          </Button>
        </div>
      </section>
    </div>
  );
}

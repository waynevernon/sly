import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Update } from "@tauri-apps/plugin-updater";
import { toast } from "sonner";
import { ExternalLinkIcon } from "../icons";
import { Button } from "../ui";
import { getUpdateToastContent } from "../../lib/updateMetadata";

export function UpdateToast({
  update,
  toastId,
}: {
  update: Update;
  toastId: string | number;
}) {
  const [installing, setInstalling] = useState(false);
  const { body, releaseNotesUrl } = getUpdateToastContent(
    update.rawJson,
    update.version,
    update.body,
  );

  const handleUpdate = async () => {
    setInstalling(true);
    try {
      await update.downloadAndInstall();
      toast.dismiss(toastId);
      toast(<InstalledUpdateToast />, {
        id: "update-installed-toast",
        duration: Infinity,
        closeButton: true,
      });
    } catch (err) {
      console.error("Update failed:", err);
      toast.error("Update failed. Please try again later.");
      setInstalling(false);
    }
  };

  const handleOpenReleaseNotes = async () => {
    if (!releaseNotesUrl) return;

    try {
      await invoke("open_url_safe", { url: releaseNotesUrl });
    } catch (err) {
      console.error("Failed to open release notes:", err);
      toast.error(err instanceof Error ? err.message : "Failed to open URL");
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="font-medium text-sm">
        Update Available: v{update.version}
      </div>
      <div className="text-xs text-text-muted whitespace-pre-line">{body}</div>
      <div className="mt-1 flex items-center gap-2">
        <Button
          onClick={handleUpdate}
          disabled={installing}
          size="sm"
          variant="primary"
        >
          {installing ? "Installing..." : "Update Now"}
        </Button>
        {releaseNotesUrl && (
          <Button
            onClick={handleOpenReleaseNotes}
            size="sm"
            variant="outline"
            className="gap-1.25"
          >
            <ExternalLinkIcon className="w-3.5 h-3.5 stroke-[1.5]" />
            Release Notes
          </Button>
        )}
      </div>
    </div>
  );
}

function InstalledUpdateToast() {
  const handleRestart = () => {
    void invoke("restart_app");
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="font-medium text-sm">Update Installed</div>
      <div className="text-xs text-text-muted">
        Restart Sly to apply it.
      </div>
      <div className="mt-1 flex items-center gap-2">
        <Button onClick={handleRestart} size="sm" variant="primary">
          Restart
        </Button>
      </div>
    </div>
  );
}

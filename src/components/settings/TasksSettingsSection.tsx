import { useCallback, useEffect, useState } from "react";
import { useNotes } from "../../context/NotesContext";
import {
  acceleratorToLabel,
  captureAcceleratorFromEvent,
  getDefaultAccelerator,
  getTaskQuickAddShortcutLabel,
} from "../../lib/taskQuickAddShortcut";
import { isMac } from "../../lib/platform";
import { Button } from "../ui";

export function TasksSettingsSection() {
  const { settings, setTasksEnabled, setTaskQuickAddShortcut } = useNotes();
  const configuredShortcut = settings?.taskQuickAddShortcut ?? null;
  const [isRecording, setIsRecording] = useState(false);

  const isDisabled = configuredShortcut === "disabled";
  const isDefault = configuredShortcut === null;
  const currentLabel = isDisabled ? "Off" : getTaskQuickAddShortcutLabel(configuredShortcut);
  const effectiveAccelerator = configuredShortcut ?? getDefaultAccelerator();
  const showConflictWarning =
    isMac && !isDisabled && effectiveAccelerator === "Control+Space";

  const stopRecording = useCallback(() => {
    setIsRecording(false);
  }, []);

  useEffect(() => {
    if (!isRecording) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        stopRecording();
        return;
      }

      const accelerator = captureAcceleratorFromEvent(event);
      if (accelerator) {
        event.preventDefault();
        event.stopPropagation();
        void setTaskQuickAddShortcut(accelerator);
        stopRecording();
      } else if (event.key !== "Shift" && event.key !== "CapsLock") {
        // Non-modifier key with no strong modifier — swallow it so nothing fires
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [isRecording, setTaskQuickAddShortcut, stopRecording]);

  return (
    <div className="space-y-10 pt-8 pb-10">
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-6">
          <div className="flex flex-col gap-0.75">
            <h2 className="text-xl font-medium">Tasks</h2>
            <p className="text-sm text-text-muted max-w-lg">
              Enable a lightweight task list. Tasks are stored in{" "}
              <code className="font-mono text-xs">.sly/tasks.db</code> inside this vault.
            </p>
          </div>
          <div className="ui-settings-toggle-group">
            <Button
              onClick={() => void setTasksEnabled(false)}
              variant={!settings?.tasksEnabled ? "primary" : "ghost"}
              size="xs"
            >
              Off
            </Button>
            <Button
              onClick={() => void setTasksEnabled(true)}
              variant={settings?.tasksEnabled ? "primary" : "ghost"}
              size="xs"
            >
              On
            </Button>
          </div>
        </div>
      </section>

      <section className="flex items-start justify-between gap-6 border-t border-border/60 pt-6">
        <div className="flex flex-col gap-0.75">
          <h2 className="text-xl font-medium">Global Quick Add Shortcut</h2>
          <p className="text-sm text-text-muted max-w-lg">
            When Sly is already running, this shortcut brings the app forward and opens the
            quick task add dialog.
          </p>
          {showConflictWarning ? (
            <p className="text-xs text-text-muted max-w-lg mt-1">
              <code className="font-mono text-[11px]">Control+Space</code> can conflict with
              macOS input-source shortcuts. If it does, change it here or free it in System
              Settings.
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isRecording ? (
            <>
              <div className="flex items-center h-[var(--ui-control-height-sm)] px-3 rounded-md border border-accent bg-accent/10 text-xs text-accent animate-pulse min-w-32">
                Press shortcut keys&hellip;
              </div>
              <Button size="xs" variant="ghost" onClick={stopRecording}>
                Cancel
              </Button>
            </>
          ) : isDisabled ? (
            <Button
              size="xs"
              variant="outline"
              onClick={() => void setTaskQuickAddShortcut(null)}
            >
              Enable
            </Button>
          ) : (
            <>
              <Button size="xs" variant="outline" onClick={() => setIsRecording(true)}>
                {currentLabel}
              </Button>
              {!isDefault && (
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => void setTaskQuickAddShortcut(null)}
                >
                  Reset
                </Button>
              )}
              <Button
                size="xs"
                variant="ghost"
                onClick={() => void setTaskQuickAddShortcut("disabled")}
              >
                Disable
              </Button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

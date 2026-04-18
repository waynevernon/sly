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

      <section className="flex flex-col gap-4 border-t border-border/60 pt-6">
        <div className="flex flex-col gap-0.75">
          <h3 className="text-base font-medium">Global Quick Add Shortcut</h3>
          <p className="text-sm text-text-muted max-w-xl">
            When Sly is already running, this shortcut brings the app forward and opens the
            existing quick task add dialog.
          </p>
          {showConflictWarning ? (
            <p className="text-xs text-text-muted max-w-xl">
              <code className="font-mono text-[11px]">Control+Space</code> can conflict with
              macOS input-source shortcuts. If it does, change it here or free it in System
              Settings.
            </p>
          ) : null}
        </div>

        {isRecording ? (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 h-[var(--ui-control-height-compact)] px-3 rounded-md border border-accent bg-accent/10 text-xs text-accent animate-pulse min-w-32">
              Press shortcut keys&hellip;
            </div>
            <Button size="xs" variant="ghost" onClick={stopRecording}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            {isDisabled ? (
              <Button
                size="xs"
                variant="default"
                onClick={() => void setTaskQuickAddShortcut(null)}
              >
                Enable
              </Button>
            ) : (
              <>
                <button
                  className="inline-flex items-center gap-1.5 h-[var(--ui-control-height-compact)] px-2.5 rounded-md border border-border bg-bg-muted hover:bg-bg-emphasis text-xs font-mono cursor-pointer transition-colors"
                  onClick={() => setIsRecording(true)}
                  title="Click to change shortcut"
                >
                  {currentLabel}
                  <span className="text-text-muted text-[10px] font-sans not-italic">
                    ✎
                  </span>
                </button>
                {!isDefault && (
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => void setTaskQuickAddShortcut(null)}
                  >
                    Reset to {acceleratorToLabel(getDefaultAccelerator())}
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
        )}
      </section>
    </div>
  );
}

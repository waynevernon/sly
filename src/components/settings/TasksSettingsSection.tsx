import { useNotes } from "../../context/NotesContext";
import {
  DEFAULT_TASK_QUICK_ADD_SHORTCUT,
  getTaskQuickAddShortcutLabel,
} from "../../lib/taskQuickAddShortcut";
import { isMac } from "../../lib/platform";
import { Button } from "../ui";

export function TasksSettingsSection() {
  const { settings, setTasksEnabled, setTaskQuickAddShortcut } = useNotes();
  const configuredShortcut = settings?.taskQuickAddShortcut ?? null;
  const shortcutOptions = isMac
    ? [
        {
          value: null,
          label: `Default (${getTaskQuickAddShortcutLabel(null)})`,
        },
        {
          value: "command-shift-n" as const,
          label: getTaskQuickAddShortcutLabel("command-shift-n"),
        },
        {
          value: "disabled" as const,
          label: "Off",
        },
      ]
    : [
        {
          value: null,
          label: `Default (${getTaskQuickAddShortcutLabel(DEFAULT_TASK_QUICK_ADD_SHORTCUT)})`,
        },
        {
          value: "disabled" as const,
          label: "Off",
        },
      ];

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
          {isMac ? (
            <p className="text-xs text-text-muted max-w-xl">
              <code className="font-mono text-[11px]">Control+Space</code> can conflict with
              macOS input-source shortcuts. If it does, pick the alternate shortcut here or free
              it in System Settings.
            </p>
          ) : null}
        </div>
        <div className="ui-settings-toggle-group flex-wrap">
          {shortcutOptions.map((option) => {
            const isSelected = configuredShortcut === option.value;
            return (
              <Button
                key={option.value ?? "default"}
                onClick={() => void setTaskQuickAddShortcut(option.value)}
                variant={isSelected ? "primary" : "ghost"}
                size="xs"
              >
                {option.label}
              </Button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

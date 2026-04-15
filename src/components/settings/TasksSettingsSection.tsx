import { useNotes } from "../../context/NotesContext";
import { Button } from "../ui";

export function TasksSettingsSection() {
  const { settings, setTasksEnabled } = useNotes();

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
    </div>
  );
}

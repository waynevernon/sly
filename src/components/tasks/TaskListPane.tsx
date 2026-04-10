import { useRef, useState, useCallback } from "react";
import { Plus } from "lucide-react";
import { useTasks } from "../../context/TasksContext";
import { compareTasks, TASK_VIEW_LABELS } from "../../lib/tasks";
import { IconButton, PanelEmptyState } from "../ui";
import { TaskRow } from "./TaskRow";
import { cn } from "../../lib/utils";

const EMPTY_MESSAGES: Record<string, { title: string; message: string }> = {
  inbox: {
    title: "Inbox is clear",
    message: "Capture tasks here. They'll stay until you schedule them.",
  },
  today: {
    title: "Nothing for today",
    message: "Tasks with today's date or earlier show up here.",
  },
  upcoming: {
    title: "Nothing scheduled",
    message: "Set an action date on a task to plan ahead.",
  },
  someday: {
    title: "Nothing in Someday",
    message: "Tasks you want to revisit eventually but not now.",
  },
  waiting: {
    title: "Nothing waiting",
    message: "Tasks blocked on someone or something else.",
  },
  logbook: {
    title: "No completed tasks",
    message: "Finished tasks appear here.",
  },
};

export function TaskListPane() {
  const {
    buckets,
    selectedView,
    selectedTaskId,
    today,
    isLoading,
    selectTask,
    setCompleted,
    createTask,
  } = useTasks();

  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const tasks = [...(buckets[selectedView] ?? [])].sort((a, b) =>
    compareTasks(a, b, selectedView),
  );
  const empty = EMPTY_MESSAGES[selectedView] ?? {
    title: "Nothing here",
    message: "",
  };

  const handleStartCreate = useCallback(() => {
    setIsCreating(true);
    setNewTitle("");
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const handleCommitCreate = useCallback(async () => {
    const title = newTitle.trim();
    setIsCreating(false);
    setNewTitle("");
    if (!title) return;
    const task = await createTask(title);
    if (task) {
      selectTask(task.id);
    }
  }, [createTask, newTitle, selectTask]);

  const handleCreateKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void handleCommitCreate();
      } else if (event.key === "Escape") {
        setIsCreating(false);
        setNewTitle("");
      }
    },
    [handleCommitCreate],
  );

  return (
    <div className="flex h-full flex-col select-none bg-bg">
      <div className="ui-pane-drag-region" data-tauri-drag-region></div>
      <div className="ui-pane-header border-border/80">
        <div className="font-medium text-base text-text">
          {TASK_VIEW_LABELS[selectedView]}
        </div>
        {selectedView !== "logbook" && (
          <div className="ui-pane-header-actions ml-auto">
            <IconButton
              type="button"
              title="New Task"
              variant="ghost"
              onClick={handleStartCreate}
            >
              <Plus className="h-4 w-4 stroke-[1.8]" />
            </IconButton>
          </div>
        )}
      </div>

      <div className="ui-scrollbar-overlay flex-1 overflow-y-auto px-1.5 py-2">
        {isLoading ? (
          <PanelEmptyState
            title="Loading tasks"
            message="Reading your task list."
          />
        ) : tasks.length === 0 && !isCreating ? (
          <PanelEmptyState title={empty.title} message={empty.message} />
        ) : (
          <div role="listbox" aria-label={TASK_VIEW_LABELS[selectedView]}>
            {tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                view={selectedView}
                today={today}
                isSelected={selectedTaskId === task.id}
                onSelect={() => selectTask(task.id === selectedTaskId ? null : task.id)}
                onToggleComplete={() => void setCompleted(task.id, !task.completedAt)}
              />
            ))}

            {isCreating && (
              <div className="flex items-center gap-2.5 rounded-md bg-bg-muted/50 px-2.5 py-2">
                <div className="mt-0.5 h-4 w-4 shrink-0 rounded-[var(--ui-radius-sm)] border border-border bg-bg" />
                <input
                  ref={inputRef}
                  type="text"
                  value={newTitle}
                  placeholder="Task name"
                  onChange={(event) => setNewTitle(event.target.value)}
                  onBlur={() => void handleCommitCreate()}
                  onKeyDown={handleCreateKeyDown}
                  className={cn(
                    "min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-text-muted/50",
                  )}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

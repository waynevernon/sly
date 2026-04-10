import { useRef, useState, useCallback } from "react";
import { CalendarClock, CheckCheck, CheckSquare, Inbox, Plus } from "lucide-react";
import { useTasks } from "../../context/TasksContext";
import {
  compareTasks,
  localDateToNormalizedActionAt,
  TASK_VIEW_LABELS,
} from "../../lib/tasks";
import { Button, IconButton, PanelEmptyState } from "../ui";
import { TaskRow } from "./TaskRow";
import { cn } from "../../lib/utils";
import type { TaskView } from "../../types/tasks";

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
  completed: {
    title: "No completed tasks",
    message: "Finished tasks appear here.",
  },
};

const EMPTY_STATE_ICONS: Record<TaskView, React.FC<{ className?: string }>> = {
  inbox: Inbox,
  today: CheckSquare,
  upcoming: CalendarClock,
  completed: CheckCheck,
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
    updateTask,
  } = useTasks();

  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const tasks = [...(buckets[selectedView] ?? [])].sort((a, b) =>
    compareTasks(a, b, selectedView),
  );
  const showEmptyState = isLoading || (tasks.length === 0 && !isCreating);
  const empty = EMPTY_MESSAGES[selectedView] ?? {
    title: "Nothing here",
    message: "",
  };
  const EmptyStateIcon = EMPTY_STATE_ICONS[selectedView];

  const focusCreateInput = useCallback(() => {
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const handleStartCreate = useCallback(() => {
    setIsCreating(true);
    setNewTitle("");
    focusCreateInput();
  }, [focusCreateInput]);

  const handleCommitCreate = useCallback(async (options?: {
    continueCapturing?: boolean;
  }) => {
    const continueCapturing = options?.continueCapturing ?? false;
    const title = newTitle.trim();
    if (!title) {
      if (continueCapturing) {
        focusCreateInput();
      } else {
        setIsCreating(false);
      }
      return;
    }

    const task = await createTask(title);
    setNewTitle("");

    if (task && selectedView === "today" && !task.actionAt) {
      await updateTask(task.id, {
        actionAt: localDateToNormalizedActionAt(today),
      });
    }

    if (continueCapturing) {
      setIsCreating(true);
      focusCreateInput();
      return;
    }

    setIsCreating(false);
    if (task) {
      selectTask(task.id);
    }
  }, [createTask, focusCreateInput, newTitle, selectTask, selectedView, today, updateTask]);

  const handleCreateKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void handleCommitCreate({ continueCapturing: true });
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
        {selectedView !== "completed" && (
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

      <div
        className={cn(
          "ui-scrollbar-overlay flex-1 overflow-y-auto",
          showEmptyState ? "" : "",
        )}
      >
        {isLoading ? (
          <div className="flex min-h-full">
            <PanelEmptyState
              title="Loading tasks"
              message="Reading your task list."
            />
          </div>
        ) : tasks.length === 0 && !isCreating ? (
          <div className="flex min-h-full">
            <PanelEmptyState
              icon={<EmptyStateIcon />}
              title={empty.title}
              message={empty.message}
              action={selectedView !== "completed" ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={handleStartCreate}
                >
                  New Task
                </Button>
              ) : undefined}
            />
          </div>
        ) : (
          <div
            role="listbox"
            aria-label={TASK_VIEW_LABELS[selectedView]}
            className="flex flex-col gap-1 px-1.5 pt-2.5 pb-1.5 outline-none"
          >
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
              <div className="flex items-center gap-2.5 rounded-md bg-bg-muted/50 pl-2.5 pr-2.5 py-1.75">
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

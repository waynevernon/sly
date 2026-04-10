import { useRef, useState, useCallback, useEffect } from "react";
import { Archive, CalendarClock, CheckCheck, CheckSquare, Clock3, Inbox, Plus, X } from "lucide-react";
import { useTasks } from "../../context/TasksContext";
import {
  compareTasks,
  detectTaskDateFromTitle,
  taskScheduleSelectionFromView,
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
  anytime: {
    title: "Nothing queued anytime",
    message: "Use Anytime for tasks you want to keep active without picking a day.",
  },
  someday: {
    title: "Nothing in someday",
    message: "Park colder ideas here so they stay visible but out of the way.",
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
  anytime: Clock3,
  someday: Archive,
  completed: CheckCheck,
};
const CREATE_DATE_DEBOUNCE_MS = 350;

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
  const [detectedDate, setDetectedDate] = useState<ReturnType<typeof detectTaskDateFromTitle>>(null);
  const [ignoredDetectionSignature, setIgnoredDetectionSignature] = useState<string | null>(null);
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
    setDetectedDate(null);
    setIgnoredDetectionSignature(null);
    focusCreateInput();
  }, [focusCreateInput]);

  useEffect(() => {
    if (!isCreating) {
      setDetectedDate(null);
      return;
    }

    if (!newTitle.trim()) {
      setDetectedDate(null);
      return;
    }

    const timer = setTimeout(() => {
      const nextDetection = detectTaskDateFromTitle(newTitle, today);
      if (!nextDetection || nextDetection.signature === ignoredDetectionSignature) {
        setDetectedDate(null);
        return;
      }
      setDetectedDate(nextDetection);
    }, CREATE_DATE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [ignoredDetectionSignature, isCreating, newTitle, today]);

  const handleCommitCreate = useCallback(async (options?: {
    continueCapturing?: boolean;
  }) => {
    const continueCapturing = options?.continueCapturing ?? false;
    const nextDetection = detectTaskDateFromTitle(newTitle, today);
    const activeDetection =
      nextDetection && nextDetection.signature !== ignoredDetectionSignature
        ? nextDetection
        : null;
    const title = (activeDetection?.cleanedTitle ?? newTitle).trim();
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
    setDetectedDate(null);
    setIgnoredDetectionSignature(null);

    if (task && activeDetection && !task.actionAt) {
      await updateTask(task.id, {
        actionAt: activeDetection.actionAt,
        scheduleBucket: null,
      });
    } else if (task && !task.actionAt && !task.scheduleBucket) {
      const defaultSchedule = taskScheduleSelectionFromView(selectedView, today);
      if (defaultSchedule) {
        await updateTask(task.id, defaultSchedule);
      }
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
  }, [
    createTask,
    focusCreateInput,
    ignoredDetectionSignature,
    newTitle,
    selectTask,
    selectedView,
    today,
    updateTask,
  ]);

  const handleCreateKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void handleCommitCreate({ continueCapturing: true });
      } else if (event.key === "Escape") {
        setIsCreating(false);
        setNewTitle("");
        setDetectedDate(null);
        setIgnoredDetectionSignature(null);
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
              <div className="rounded-md bg-bg-muted/50 pl-2.5 pr-2.5 py-1.75">
                <div className="flex items-center gap-2.5">
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

                {detectedDate ? (
                  <div className="mt-2 flex items-center pl-6.5">
                    <div className="inline-flex h-[var(--ui-control-height-compact)] items-center gap-1.5 rounded-[var(--ui-radius-md)] bg-bg px-2.5 text-xs font-medium text-text-muted">
                      <CalendarClock className="h-3.5 w-3.5 shrink-0 stroke-[1.8]" />
                      <span>Date: {detectedDate.label}</span>
                      <button
                        type="button"
                        aria-label="Dismiss detected date"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          setIgnoredDetectionSignature(detectedDate.signature);
                          setDetectedDate(null);
                          inputRef.current?.focus();
                        }}
                        className="ui-focus-ring inline-flex h-4 w-4 items-center justify-center rounded-[var(--ui-radius-sm)] text-text-muted transition-colors hover:bg-bg-muted hover:text-text"
                      >
                        <X className="h-3 w-3 stroke-[2]" />
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

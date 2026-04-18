import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Clock3,
  ListTodo,
  ExternalLink,
  LoaderCircle,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useTasks } from "../../context/TasksContext";
import {
  actionAtToLocalDate,
  localDateToNormalizedActionAt,
} from "../../lib/tasks";
import { cn } from "../../lib/utils";
import type { TaskPatch, TaskScheduleBucket } from "../../types/tasks";
import { Button, IconButton, PanelEmptyState, PopoverTextEditor } from "../ui";
import { DueDatePicker, TaskDatePicker } from "./TaskDatePicker";
import { RecurrencePicker } from "./RecurrencePicker";

const DEBOUNCE_MS = 600;

export function TaskDetailPanel() {
  const {
    selectedTask,
    selectedTaskId,
    isLoadingTask,
    tasks,
    updateTask,
    deleteTask,
    setCompleted,
    today,
  } = useTasks();


  const [title, setTitle] = useState("");
  const [actionDate, setActionDate] = useState("");
  const [scheduleBucket, setScheduleBucket] = useState<TaskScheduleBucket | null>(null);
  const [dueDate, setDueDate] = useState("");
  const [recurrence, setRecurrence] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const [waitingFor, setWaitingFor] = useState("");
  const [waitingEditorOpen, setWaitingEditorOpen] = useState(false);
  const [description, setDescription] = useState("");

  const taskIdRef = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPatchRef = useRef<TaskPatch>({});

  const scheduleSave = useCallback(
    (patch: TaskPatch) => {
      if (!taskIdRef.current) return;
      pendingPatchRef.current = { ...pendingPatchRef.current, ...patch };
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        const id = taskIdRef.current;
        const pendingPatch = pendingPatchRef.current;
        if (!id || Object.keys(pendingPatch).length === 0) return;
        pendingPatchRef.current = {};
        void updateTask(id, pendingPatch);
      }, DEBOUNCE_MS);
    },
    [updateTask],
  );

  const flushSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const id = taskIdRef.current;
    const pendingPatch = pendingPatchRef.current;
    if (!id || Object.keys(pendingPatch).length === 0) return;
    pendingPatchRef.current = {};
    void updateTask(id, pendingPatch);
  }, [updateTask]);

  useEffect(() => {
    return () => {
      flushSave();
    };
  }, [flushSave]);

  useEffect(() => {
    flushSave();

    if (!selectedTask) return;
    taskIdRef.current = selectedTask.id;
    setTitle(selectedTask.title);
    setActionDate(actionAtToLocalDate(selectedTask.actionAt) ?? "");
    setScheduleBucket(selectedTask.scheduleBucket);
    setDueDate(actionAtToLocalDate(selectedTask.dueAt) ?? "");
    setRecurrence(selectedTask.recurrence);
    setLink(selectedTask.link);
    setWaitingFor(selectedTask.waitingFor);
    setWaitingEditorOpen(false);
    setDescription(selectedTask.description);
    pendingPatchRef.current = {};
  }, [flushSave, selectedTask?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTitleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(event.target.value);
    scheduleSave({ title: event.target.value });
  };

  const handleDescriptionChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDescription(event.target.value);
    scheduleSave({ description: event.target.value });
  };

  const handleLinkChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setLink(event.target.value);
    scheduleSave({ link: event.target.value });
  };

  const commitWaitingFor = useCallback(
    (nextValue: string) => {
      const normalizedValue = nextValue.trim();
      setWaitingFor(normalizedValue);
      setWaitingEditorOpen(false);
      scheduleSave({ waitingFor: normalizedValue });
      flushSave();
    },
    [flushSave, scheduleSave],
  );

  const commitSchedule = useCallback(
    (next: { actionDate: string | null; scheduleBucket: TaskScheduleBucket | null }) => {
      setActionDate(next.actionDate ?? "");
      setScheduleBucket(next.scheduleBucket);
      scheduleSave({
        actionAt: localDateToNormalizedActionAt(next.actionDate),
        scheduleBucket: next.scheduleBucket,
      });
      flushSave();
    },
    [flushSave, scheduleSave],
  );

  const commitDueDate = useCallback(
    (date: string | null) => {
      setDueDate(date ?? "");
      scheduleSave({ dueAt: localDateToNormalizedActionAt(date) });
      flushSave();
    },
    [flushSave, scheduleSave],
  );

  const commitRecurrence = useCallback(
    (next: string | null) => {
      setRecurrence(next);
      scheduleSave({ recurrence: next });
      flushSave();
    },
    [flushSave, scheduleSave],
  );

  const handleToggleComplete = async () => {
    const id = taskIdRef.current;
    if (!id || !selectedTask) return;
    await setCompleted(id, !selectedTask.completedAt);
  };

  const handleDelete = async () => {
    const id = taskIdRef.current;
    if (!id) return;
    await deleteTask(id);
  };

  const openableLink = useMemo(() => normalizeTaskLinkUrl(link), [link]);
  const waitingForSuggestions = useMemo(() => {
    const counts = new Map<string, { value: string; count: number }>();

    for (const task of tasks) {
      const candidate = task.waitingFor.trim();
      if (!candidate) continue;
      if (task.id === selectedTask?.id) continue;

      const key = candidate.toLocaleLowerCase();
      const existing = counts.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(key, { value: candidate, count: 1 });
      }
    }

    return [...counts.values()]
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
      .map((entry) => entry.value);
  }, [selectedTask?.id, tasks]);
  const hasWaitingFor = waitingFor.trim().length > 0;
  const isCompleted = Boolean(selectedTask?.completedAt);
  const showEmptyState = (isLoadingTask && selectedTaskId) || !selectedTaskId || !selectedTask;

  const handleOpenLink = useCallback(async () => {
    if (!openableLink) return;
    try {
      await invoke("open_url_safe", { url: openableLink });
    } catch (err) {
      console.error("Failed to open task link:", err);
      toast.error(err instanceof Error ? err.message : "Failed to open link");
    }
  }, [openableLink]);

  const renderBody = () => {
    if (isLoadingTask && selectedTaskId) {
      return (
        <PanelEmptyState
          icon={<LoaderCircle className="animate-spin" />}
          title="Loading task"
          message="Opening task details."
        />
      );
    }

    if (!selectedTaskId || !selectedTask) {
      return (
        <PanelEmptyState
          icon={<ListTodo />}
          title="Select a task"
          message="Choose a task from the list to open its details here."
        />
      );
    }

    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col px-6 py-7 sm:px-8">
        <div
          className="grid gap-x-4 gap-y-4"
          style={{ gridTemplateColumns: "20px minmax(0, 1fr)" }}
        >
          <button
            type="button"
            aria-label={isCompleted ? "Mark incomplete" : "Mark complete"}
            onClick={() => void handleToggleComplete()}
            className={cn(
              "ui-focus-ring mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
              isCompleted
                ? "border-accent bg-accent text-text-inverse"
                : "border-border hover:border-accent/60",
            )}
          >
            {isCompleted && (
              <svg viewBox="0 0 10 8" className="h-2.5 w-2.5 fill-none stroke-current stroke-[2.5]">
                <polyline points="1,4 4,7 9,1" />
              </svg>
            )}
          </button>

          <div className="flex min-w-0 items-start gap-3">
            <input
              type="text"
              value={title}
              placeholder="Task name"
              onChange={handleTitleChange}
              onBlur={flushSave}
              className="min-w-0 flex-1 bg-transparent text-2xl font-medium leading-tight text-text outline-none placeholder:text-text-muted/50"
            />
            <IconButton
              type="button"
              variant="ghost"
              title={selectedTask.starred ? "Unstar task" : "Star task"}
              onClick={() => void updateTask(selectedTask.id, { starred: !selectedTask.starred })}
              className={cn(
                "mt-0.5 shrink-0",
                selectedTask.starred ? "text-amber-400 hover:text-amber-400/80" : undefined,
              )}
            >
              <Star
                className="h-4.5 w-4.5"
                fill={selectedTask.starred ? "currentColor" : "none"}
                strokeWidth={selectedTask.starred ? 0 : 1.5}
              />
            </IconButton>
          </div>

          <div />
          <div className="flex flex-wrap items-center gap-2">
            <TaskDatePicker
              actionDate={actionDate}
              scheduleBucket={scheduleBucket}
              today={today}
              onChange={commitSchedule}
            />
            <DueDatePicker
              dueDate={dueDate}
              today={today}
              onChange={commitDueDate}
            />
            {actionDate ? (
              <RecurrencePicker
                recurrence={recurrence}
                actionDate={actionDate}
                onChange={commitRecurrence}
              />
            ) : null}
            <PopoverTextEditor
              open={waitingEditorOpen}
              onOpenChange={setWaitingEditorOpen}
              value={waitingFor}
              onSubmit={commitWaitingFor}
              title="Waiting"
              placeholder="Waiting…"
              icon={<Clock3 className="h-4 w-4 stroke-[1.7]" />}
              suggestions={waitingForSuggestions}
              renderTrigger={({ openEditor }) =>
                hasWaitingFor ? (
                  <button
                    type="button"
                    onClick={openEditor}
                    className="ui-focus-ring group inline-flex h-[var(--ui-control-height-standard)] max-w-[320px] items-center gap-2 rounded-[var(--ui-radius-md)] bg-bg-muted/70 px-3 text-sm text-text transition-colors hover:bg-bg-muted"
                  >
                    <Clock3 className="h-4 w-4 shrink-0 stroke-[1.7] text-text-muted transition-colors group-hover:text-text" />
                    <span className="truncate text-left">{waitingFor}</span>
                  </button>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={openEditor}
                    className="gap-2"
                  >
                    <Clock3 className="h-4 w-4 stroke-[1.7]" />
                    <span>Waiting</span>
                  </Button>
                )
              }
            />
          </div>

          <div />
          <div className="border-t border-border/40" />

          <div />
          <div className="space-y-1">
            <div className="text-sm text-text-muted">
              Link
            </div>
            <div className="relative">
              <input
                type="text"
                value={link}
                placeholder="Add link…"
                onChange={handleLinkChange}
                onBlur={flushSave}
                className="w-full bg-transparent pr-8 text-sm leading-relaxed text-text outline-none placeholder:text-text-muted/40"
              />
              {openableLink ? (
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => void handleOpenLink()}
                  aria-label="Open link"
                  className="ui-focus-ring absolute top-1/2 right-0 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-[var(--ui-radius-md)] text-text-muted transition-colors hover:bg-bg-muted hover:text-text"
                >
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 stroke-[1.8]" />
                </button>
              ) : null}
            </div>
          </div>

          <div />
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-text-muted">
                Description
              </div>
            </div>
            <textarea
              value={description}
              placeholder="Add description…"
              onChange={handleDescriptionChange}
              onBlur={flushSave}
              rows={12}
              className="min-h-[320px] w-full resize-none bg-transparent text-sm leading-relaxed text-text outline-none placeholder:text-text-muted/40"
            />
          </div>

          <div />
          <div className="border-t border-border/40" />

          <div />
          <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted/50">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <span>Created {formatTaskTimestamp(selectedTask.createdAt)}</span>
              {selectedTask.completedAt ? (
                <>
                  <span className="text-text-muted/30">·</span>
                  <span>Completed {formatTaskTimestamp(selectedTask.completedAt)}</span>
                </>
              ) : null}
            </div>
            <div className="ml-auto">
              <IconButton
                type="button"
                variant="ghost"
                title="Delete Task"
                onClick={() => void handleDelete()}
                className="h-6.5 w-6.5 text-text-muted/70 hover:text-text"
              >
                <Trash2 className="h-4 w-4 stroke-[1.5]" />
              </IconButton>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-bg">
      <div className="ui-pane-drag-region" data-tauri-drag-region></div>
      <div className="ui-pane-header border-border/80">
        <div className="flex-1" />
      </div>

      <div className="ui-scrollbar-overlay flex-1 overflow-y-auto">
        {showEmptyState ? (
          <div className="flex min-h-full">
            {renderBody()}
          </div>
        ) : renderBody()}
      </div>
    </div>
  );
}

function normalizeTaskLinkUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("mailto:")) {
    return trimmed;
  }

  const withScheme = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const url = new URL(withScheme);
    if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:") {
      return url.toString();
    }
  } catch {
    return null;
  }

  return null;
}

function formatTaskTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  CheckSquare,
  Clock3,
  ExternalLink,
  LoaderCircle,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useTasks } from "../../context/TasksContext";
import {
  actionAtToLocalDate,
  localDateToNormalizedActionAt,
} from "../../lib/tasks";
import { cn } from "../../lib/utils";
import type { TaskPatch, TaskScheduleBucket } from "../../types/tasks";
import { Button, IconButton, PanelEmptyState, PopoverSurface } from "../ui";
import { TaskDatePicker } from "./TaskDatePicker";

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
  const [link, setLink] = useState("");
  const [waitingFor, setWaitingFor] = useState("");
  const [waitingForEditing, setWaitingForEditing] = useState(false);
  const [waitingForFocused, setWaitingForFocused] = useState(false);
  const [description, setDescription] = useState("");

  const taskIdRef = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPatchRef = useRef<TaskPatch>({});
  const waitingForInputRef = useRef<HTMLInputElement>(null);
  const waitingForPendingBlurValueRef = useRef<string | null>(null);

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
    setLink(selectedTask.link);
    setWaitingFor(selectedTask.waitingFor);
    setWaitingForEditing(false);
    setWaitingForFocused(false);
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

  const handleWaitingForChange = (nextValue: string) => {
    setWaitingFor(nextValue);
    scheduleSave({ waitingFor: nextValue });
  };

  const commitWaitingFor = useCallback(
    (nextValue?: string, options?: { blur?: boolean }) => {
      const resolvedValue = nextValue ?? waitingFor;
      const normalizedValue = resolvedValue.trim();
      const shouldBlur = options?.blur ?? false;

      setWaitingFor(normalizedValue);
      setWaitingForEditing(false);
      setWaitingForFocused(false);
      scheduleSave({ waitingFor: normalizedValue });
      flushSave();
      if (shouldBlur) {
        waitingForPendingBlurValueRef.current = normalizedValue;
        waitingForInputRef.current?.blur();
      }
    },
    [flushSave, scheduleSave, waitingFor],
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
  const filteredWaitingForSuggestions = useMemo(() => {
    const query = waitingFor.trim().toLocaleLowerCase();
    return waitingForSuggestions
      .filter((value) => {
        const normalized = value.toLocaleLowerCase();
        if (!query) return true;
        if (normalized === query) return false;
        return normalized.includes(query);
      })
      .slice(0, 6);
  }, [waitingFor, waitingForSuggestions]);
  const hasWaitingFor = waitingFor.trim().length > 0;
  const showWaitingForSuggestions =
    waitingForEditing && waitingForFocused && filteredWaitingForSuggestions.length > 0;
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
          icon={<CheckSquare />}
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
              "mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors outline-none",
              "focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-1",
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

          <input
            type="text"
            value={title}
            placeholder="Task name"
            onChange={handleTitleChange}
            onBlur={flushSave}
            className="min-w-0 bg-transparent text-2xl font-medium leading-tight text-text outline-none placeholder:text-text-muted/50"
          />

          <div />
          <div className="flex flex-wrap items-center gap-2">
            <TaskDatePicker
              actionDate={actionDate}
              scheduleBucket={scheduleBucket}
              today={today}
              onChange={commitSchedule}
            />
            {waitingForEditing ? (
              <div className="relative min-w-[220px] max-w-[320px] flex-1">
                <div className="flex h-[var(--ui-control-height-standard)] items-center gap-2 rounded-[var(--ui-radius-md)] bg-bg-muted/70 px-3 text-sm text-text">
                  <Clock3 className="h-4 w-4 shrink-0 stroke-[1.7] text-text-muted" />
                  <input
                    ref={waitingForInputRef}
                    type="text"
                    value={waitingFor}
                    placeholder="Waiting for…"
                    onChange={(event) => handleWaitingForChange(event.target.value)}
                    onFocus={() => setWaitingForFocused(true)}
                    onBlur={(event) => {
                      setWaitingForFocused(false);
                      const pendingValue = waitingForPendingBlurValueRef.current;
                      waitingForPendingBlurValueRef.current = null;
                      commitWaitingFor(pendingValue ?? event.currentTarget.value);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        commitWaitingFor(event.currentTarget.value, { blur: true });
                      } else if (event.key === "Escape") {
                        event.preventDefault();
                        setWaitingFor(selectedTask?.waitingFor ?? "");
                        setWaitingForEditing(false);
                        setWaitingForFocused(false);
                        waitingForInputRef.current?.blur();
                      }
                    }}
                    className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-text-muted"
                  />
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setWaitingFor("");
                      setWaitingForEditing(false);
                      setWaitingForFocused(false);
                      scheduleSave({ waitingFor: "" });
                      flushSave();
                    }}
                    className="ui-focus-ring inline-flex h-5 w-5 items-center justify-center rounded-[var(--ui-radius-sm)] text-text-muted transition-colors hover:bg-bg hover:text-text"
                    aria-label="Clear waiting for"
                  >
                    <X className="h-3.5 w-3.5 stroke-[1.9]" />
                  </button>
                </div>

                {showWaitingForSuggestions ? (
                  <PopoverSurface className="absolute left-0 top-[calc(100%+8px)] z-20 w-full p-1.5">
                    <div className="flex flex-col gap-1">
                      {filteredWaitingForSuggestions.map((value) => (
                        <button
                          key={value}
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            commitWaitingFor(value, { blur: true });
                          }}
                          className="ui-focus-ring flex w-full items-center gap-2 rounded-[var(--ui-radius-md)] px-2.5 py-2 text-left text-sm text-text transition-colors hover:bg-bg-muted"
                        >
                          <UserRound className="h-3.5 w-3.5 shrink-0 stroke-[1.8] text-text-muted" />
                          <span className="truncate">{value}</span>
                        </button>
                      ))}
                    </div>
                  </PopoverSurface>
                ) : null}
              </div>
            ) : hasWaitingFor ? (
              <button
                type="button"
                onClick={() => {
                  setWaitingForEditing(true);
                  requestAnimationFrame(() => waitingForInputRef.current?.focus());
                }}
                className="ui-focus-ring inline-flex h-[var(--ui-control-height-standard)] max-w-[320px] items-center gap-2 rounded-[var(--ui-radius-md)] bg-bg-muted/70 px-3 text-sm text-text transition-colors hover:bg-bg-muted"
              >
                <Clock3 className="h-4 w-4 shrink-0 stroke-[1.7] text-text-muted" />
                <span className="truncate text-left">Waiting for {waitingFor}</span>
              </button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setWaitingForEditing(true);
                  requestAnimationFrame(() => waitingForInputRef.current?.focus());
                }}
                className="gap-2"
              >
                <Clock3 className="h-4 w-4 stroke-[1.7]" />
                <span>Waiting for</span>
              </Button>
            )}
          </div>

          <div />
          <div className="border-t border-border/40" />

          <div />
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-text-muted/70">
            <div className="flex items-center gap-2">
              <span className="font-medium uppercase tracking-[0.08em] text-text-muted/65">
                Created
              </span>
              <span>{formatTaskTimestamp(selectedTask.createdAt)}</span>
            </div>
            {selectedTask.completedAt ? (
              <div className="flex items-center gap-2">
                <span className="font-medium uppercase tracking-[0.08em] text-text-muted/65">
                  Completed
                </span>
                <span>{formatTaskTimestamp(selectedTask.completedAt)}</span>
              </div>
            ) : null}
          </div>

          <div />
          <div className="border-t border-border/40" />

          <div />
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted/65">
                Link
              </div>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => void handleOpenLink()}
                disabled={!openableLink}
                aria-hidden={!openableLink}
                tabIndex={openableLink ? 0 : -1}
                className={cn(
                  "ui-focus-ring inline-flex items-center gap-1.5 rounded-[var(--ui-radius-md)] px-2 py-1 text-xs transition-colors",
                  openableLink
                    ? "text-text-muted hover:bg-bg-muted hover:text-text"
                    : "pointer-events-none invisible",
                )}
              >
                <ExternalLink className="h-3.5 w-3.5 shrink-0 stroke-[1.8]" />
                <span>Open Link</span>
              </button>
            </div>
            <input
              type="text"
              value={link}
              placeholder="Add link…"
              onChange={handleLinkChange}
              onBlur={flushSave}
              className="w-full bg-transparent text-sm leading-relaxed text-text outline-none placeholder:text-text-muted/40"
            />
          </div>

          <div />
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted/65">
                Description
              </div>
              <div className="h-[28px] px-2 py-1 invisible" aria-hidden="true" />
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
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-bg">
      <div className="ui-pane-drag-region" data-tauri-drag-region></div>
      <div className="ui-pane-header border-border/80">
        <div className="flex-1" />
        {selectedTask ? (
          <div className="ui-pane-header-actions ml-auto">
            <IconButton
              type="button"
              variant="ghost"
              title="Delete Task"
              onClick={() => void handleDelete()}
            >
              <Trash2 className="h-4 w-4 stroke-[1.6]" />
            </IconButton>
          </div>
        ) : null}
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

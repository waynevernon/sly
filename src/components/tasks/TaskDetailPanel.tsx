import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Clock3,
  ListTodo,
  ExternalLink,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useTasks } from "../../context/TasksContext";
import { useTheme } from "../../context/ThemeContext";
import { FolderGlyph } from "../folders/FolderGlyph";
import {
  getFolderAppearance,
  resolveFolderAppearanceIconColor,
  resolveFolderAppearanceTextColor,
} from "../../lib/folderIcons";
import {
  actionAtToLocalDate,
  localDateToNormalizedActionAt,
  normalizeTaskTag,
} from "../../lib/tasks";
import { cn } from "../../lib/utils";
import type { TaskPatch, TaskScheduleBucket } from "../../types/tasks";
import {
  IconButton,
  PanelEmptyState,
  PopoverTextEditor,
  Tooltip,
} from "../ui";
import { DueDatePicker, TaskDatePicker } from "./TaskDatePicker";
import { RecurrencePicker } from "./RecurrencePicker";
import {
  TASK_DETAIL_DIVIDER_CLASS,
  TASK_DETAIL_EMPTY_TRIGGER_CLASS,
  TASK_DETAIL_FIELD_INPUT_CLASS,
  TASK_DETAIL_FILLED_TRIGGER_CLASS,
  TASK_DETAIL_LABEL_CLASS,
  TASK_DETAIL_SECTION_CLASS,
} from "./taskDetailSurface";

const DEBOUNCE_MS = 600;

export function TaskDetailPanel() {
  const {
    selectedTask,
    selectedTaskId,
    tasks,
    taskTagAppearances,
    updateTask,
    deleteTask,
    setCompleted,
    today,
  } = useTasks();
  const resolvedTheme = useResolvedThemeFallback();


  const [title, setTitle] = useState("");
  const [actionDate, setActionDate] = useState("");
  const [scheduleBucket, setScheduleBucket] = useState<TaskScheduleBucket | null>(null);
  const [dueDate, setDueDate] = useState("");
  const [recurrence, setRecurrence] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [link, setLink] = useState("");
  const [waitingFor, setWaitingFor] = useState("");
  const [waitingEditorOpen, setWaitingEditorOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [tagSuggestionIndex, setTagSuggestionIndex] = useState(0);
  const [isTagInputFocused, setIsTagInputFocused] = useState(false);

  const taskIdRef = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPatchRef = useRef<TaskPatch>({});
  const selectedTaskTagsKey = (selectedTask?.tags ?? []).join("\u0000");

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
    setTags(selectedTask.tags ?? []);
    setTagDraft("");
    setLink(selectedTask.link);
    setWaitingFor(selectedTask.waitingFor);
    setWaitingEditorOpen(false);
    setDescription(selectedTask.description);
    pendingPatchRef.current = {};
  }, [flushSave, selectedTask?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedTask) return;
    setTags(selectedTask.tags ?? []);
  }, [selectedTask, selectedTaskTagsKey]);

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

  const saveTags = useCallback((nextTags: string[]) => {
    const uniqueTags = [...new Set(nextTags)];
    setTags(uniqueTags);
    scheduleSave({ tags: uniqueTags });
    flushSave();
  }, [flushSave, scheduleSave]);

  const commitTagDraft = useCallback(() => {
    const draftTags = tagDraft
      .split(/[\s,]+/)
      .map((tag) => normalizeTaskTag(tag))
      .filter((tag): tag is string => Boolean(tag));
    if (draftTags.length === 0) {
      setTagDraft("");
      return;
    }
    saveTags([...tags, ...draftTags]);
    setTagDraft("");
  }, [saveTags, tagDraft, tags]);

  const removeTag = useCallback((tagToRemove: string) => {
    saveTags(tags.filter((tag) => tag !== tagToRemove));
  }, [saveTags, tags]);

  const knownTagSuggestions = useMemo(() => {
    const counts = new Map<string, number>();
    const selectedTagSet = new Set(tags);
    const query = normalizeTaskTag(tagDraft) ?? "";

    for (const task of tasks) {
      for (const tag of task.tags ?? []) {
        const normalizedTag = normalizeTaskTag(tag);
        if (!normalizedTag || selectedTagSet.has(normalizedTag)) continue;
        if (query && !normalizedTag.includes(query)) continue;
        counts.set(normalizedTag, (counts.get(normalizedTag) ?? 0) + 1);
      }
    }

    return [...counts.entries()]
      .sort(([leftTag, leftCount], [rightTag, rightCount]) => {
        if (leftCount !== rightCount) return rightCount - leftCount;
        return leftTag.localeCompare(rightTag);
      })
      .slice(0, 6)
      .map(([tag]) => tag);
  }, [tagDraft, tags, tasks]);

  useEffect(() => {
    setTagSuggestionIndex(0);
  }, [knownTagSuggestions]);

  const applyTagSuggestion = useCallback((tag: string) => {
    saveTags([...tags, tag]);
    setTagDraft("");
    setTagSuggestionIndex(0);
  }, [saveTags, tags]);

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
  const showEmptyState = !selectedTaskId || !selectedTask;

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
      <div className="mx-auto flex w-full min-w-0 max-w-4xl flex-col px-6 py-7 sm:px-8">
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
              className="min-w-0 flex-1 truncate bg-transparent text-2xl font-medium leading-tight text-text outline-none placeholder:text-text-muted/50"
            />
            <IconButton
              type="button"
              variant="ghost"
              title={selectedTask.starred ? "Unstar task" : "Star task"}
              onClick={() => void updateTask(selectedTask.id, { starred: !selectedTask.starred })}
              className={cn(
                "mt-0.5 shrink-0",
                selectedTask.starred
                  ? "text-[var(--color-starred)] hover:opacity-80"
                  : undefined,
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
          <div className="flex min-w-0 flex-nowrap items-center gap-2 overflow-hidden">
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
              showHeader={false}
              suggestions={waitingForSuggestions}
              renderTrigger={({ openEditor }) =>
                hasWaitingFor ? (
                  <button
                    type="button"
                    onClick={openEditor}
                    aria-label={`Waiting ${waitingFor}`}
                    className={TASK_DETAIL_FILLED_TRIGGER_CLASS}
                  >
                    <Clock3 className="h-4 w-4 shrink-0 stroke-[1.7] text-text-muted transition-colors group-hover:text-text" />
                    <span className="min-w-0 truncate text-left">{waitingFor}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={openEditor}
                    className={TASK_DETAIL_EMPTY_TRIGGER_CLASS}
                  >
                    <Clock3 className="h-4 w-4 stroke-[1.7] transition-colors group-hover:text-text" />
                    <span className="min-w-0 truncate">Waiting</span>
                  </button>
                )
              }
            />
          </div>

          <div />
          <div className={TASK_DETAIL_SECTION_CLASS}>
            <div className={TASK_DETAIL_LABEL_CLASS}>Tags</div>
            <div className="relative">
              <div
                className="flex max-h-[4.5rem] min-h-[calc(var(--ui-control-height-compact)+0.5rem)] flex-wrap items-center gap-1.5 overflow-hidden bg-transparent py-1"
                onMouseDown={(event) => {
                  if (event.target === event.currentTarget) {
                    event.preventDefault();
                    event.currentTarget.querySelector("input")?.focus();
                  }
                }}
              >
                {tags.map((tag) => {
                  const appearance = getFolderAppearance(taskTagAppearances, tag);
                  const textColor = resolveFolderAppearanceTextColor(appearance, resolvedTheme);
                  const iconColor = resolveFolderAppearanceIconColor(appearance, resolvedTheme);
                  return (
                    <span
                      key={tag}
                      className="inline-flex h-[var(--ui-control-height-compact)] max-w-full items-center gap-1.5 rounded-[var(--ui-radius-sm)] bg-bg-muted px-2 text-xs font-medium text-text"
                      style={textColor ? { color: textColor } : undefined}
                    >
                      <FolderGlyph
                        icon={appearance?.icon ?? { kind: "lucide", name: "hash" }}
                        className="h-3.5 w-3.5 shrink-0 stroke-[1.8] text-text-muted"
                        style={iconColor ? { color: iconColor } : undefined}
                      />
                      <span className="min-w-0 truncate">{tag}</span>
                      <button
                        type="button"
                        aria-label={`Remove tag ${tag}`}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => removeTag(tag)}
                        className="ui-focus-ring -mr-0.5 inline-flex h-4 w-4 items-center justify-center rounded-[var(--ui-radius-sm)] text-text-muted transition-colors hover:bg-bg hover:text-text"
                      >
                        <X className="h-3 w-3 stroke-[2]" />
                      </button>
                    </span>
                  );
                })}
                <input
                  type="text"
                  value={tagDraft}
                  placeholder={tags.length > 0 ? "Add tag…" : "Add tags…"}
                  onFocus={() => setIsTagInputFocused(true)}
                  onChange={(event) => setTagDraft(event.target.value)}
                  onBlur={() => {
                    setIsTagInputFocused(false);
                    commitTagDraft();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                      if (knownTagSuggestions.length === 0) return;
                      event.preventDefault();
                      setTagSuggestionIndex((current) =>
                        (current + 1) % knownTagSuggestions.length,
                      );
                      return;
                    }

                    if (event.key === "ArrowUp") {
                      if (knownTagSuggestions.length === 0) return;
                      event.preventDefault();
                      setTagSuggestionIndex((current) =>
                        current <= 0 ? knownTagSuggestions.length - 1 : current - 1,
                      );
                      return;
                    }

                    if (event.key === "Enter") {
                      event.preventDefault();
                      const suggestion = knownTagSuggestions[tagSuggestionIndex];
                      if (suggestion) {
                        applyTagSuggestion(suggestion);
                      } else {
                        commitTagDraft();
                      }
                      return;
                    }

                    if (event.key === "," || event.key === " ") {
                      event.preventDefault();
                      commitTagDraft();
                      return;
                    }

                    if (event.key === "Backspace" && !tagDraft && tags.length > 0) {
                      removeTag(tags[tags.length - 1]);
                    }
                  }}
                  className="h-[var(--ui-control-height-compact)] min-w-24 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-text-muted/40"
                />
              </div>
              {isTagInputFocused && knownTagSuggestions.length > 0 ? (
                <div className="absolute left-0 top-full z-40 mt-1.5 min-w-48 max-w-full rounded-[var(--ui-radius-md)] border border-border bg-bg-secondary p-1 shadow-[var(--ui-shadow-menu)]">
                  {knownTagSuggestions.map((tag, index) => {
                    const appearance = getFolderAppearance(taskTagAppearances, tag);
                    const textColor = resolveFolderAppearanceTextColor(appearance, resolvedTheme);
                    const iconColor = resolveFolderAppearanceIconColor(appearance, resolvedTheme);
                    const isActive = index === tagSuggestionIndex;

                    return (
                      <button
                        key={tag}
                        type="button"
                        onMouseEnter={() => setTagSuggestionIndex(index)}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => applyTagSuggestion(tag)}
                        className={cn(
                          "ui-focus-ring flex w-full items-center gap-2 rounded-[var(--ui-radius-md)] px-2.5 py-1.5 text-left text-sm text-text transition-colors",
                          isActive ? "bg-bg-muted" : "hover:bg-bg-muted",
                        )}
                        style={textColor ? { color: textColor } : undefined}
                      >
                        <FolderGlyph
                          icon={appearance?.icon ?? { kind: "lucide", name: "hash" }}
                          className="h-4 w-4 shrink-0 stroke-[1.7] text-text-muted"
                          style={iconColor ? { color: iconColor } : undefined}
                        />
                        <span className="min-w-0 truncate">{tag}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>

          <div />
          <div className={TASK_DETAIL_SECTION_CLASS}>
            <div className={TASK_DETAIL_LABEL_CLASS}>
              Link
            </div>
            <div className="relative">
              <input
                type="text"
                value={link}
                placeholder="Add link…"
                onChange={handleLinkChange}
                onBlur={flushSave}
                className={`${TASK_DETAIL_FIELD_INPUT_CLASS} pr-8`}
              />
              {openableLink ? (
                <Tooltip content="Open link">
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => void handleOpenLink()}
                    aria-label="Open link"
                    className="ui-focus-ring absolute top-1/2 right-0 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-[var(--ui-radius-md)] text-text-muted transition-colors hover:bg-bg-muted hover:text-text"
                  >
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 stroke-[1.8]" />
                  </button>
                </Tooltip>
              ) : null}
            </div>
          </div>

          <div />
          <div className={TASK_DETAIL_DIVIDER_CLASS} />

          <div />
          <div className={TASK_DETAIL_SECTION_CLASS}>
            <div className="flex items-center justify-between gap-3">
              <div className={TASK_DETAIL_LABEL_CLASS}>
                Description
              </div>
            </div>
            <textarea
              value={description}
              placeholder="Add description…"
              onChange={handleDescriptionChange}
              onBlur={flushSave}
              rows={12}
              className={`min-h-[320px] resize-none ${TASK_DETAIL_FIELD_INPUT_CLASS}`}
            />
          </div>

          <div />
          <div className={TASK_DETAIL_DIVIDER_CLASS} />

          <div />
          <div className="flex min-w-0 items-center gap-2 overflow-hidden text-xs text-text-muted/50">
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
              <span className="min-w-0 truncate">Created {formatTaskTimestamp(selectedTask.createdAt)}</span>
              {selectedTask.completedAt ? (
                <>
                  <span className="shrink-0 text-text-muted/30">·</span>
                  <span className="min-w-0 truncate">Completed {formatTaskTimestamp(selectedTask.completedAt)}</span>
                </>
              ) : null}
            </div>
            <div className="ml-auto shrink-0">
              <IconButton
                type="button"
                variant="ghost"
                title="Delete task"
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
    <div
      data-task-detail-panel
      className="flex h-full min-w-[360px] flex-1 flex-col overflow-hidden bg-bg"
    >
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

function useResolvedThemeFallback(): "light" | "dark" {
  try {
    return useTheme().resolvedTheme;
  } catch {
    return "light";
  }
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

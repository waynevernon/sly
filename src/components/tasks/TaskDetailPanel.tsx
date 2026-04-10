import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, Trash2 } from "lucide-react";
import { useTasks } from "../../context/TasksContext";
import { TASK_VIEW_LABELS } from "../../lib/tasks";
import { cn } from "../../lib/utils";
import type { TaskPatch } from "../../types/tasks";
import { IconButton, PanelEmptyState } from "../ui";

const DEBOUNCE_MS = 600;

export function TaskDetailPanel() {
  const {
    selectedTask,
    selectedView,
    selectedTaskId,
    isLoadingTask,
    selectTask,
    updateTask,
    deleteTask,
    setCompleted,
    today,
  } = useTasks();

  const [title, setTitle] = useState("");
  const [actionDate, setActionDate] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [someday, setSomeday] = useState(false);
  const [notes, setNotes] = useState("");

  const taskIdRef = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPatchRef = useRef<TaskPatch>({});
  const dateInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!selectedTask) return;
    taskIdRef.current = selectedTask.id;
    setTitle(selectedTask.title);
    setActionDate(selectedTask.actionDate ?? "");
    setWaiting(selectedTask.waiting);
    setSomeday(selectedTask.someday);
    setNotes(selectedTask.notes);
    pendingPatchRef.current = {};
  }, [selectedTask?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleTitleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(event.target.value);
    scheduleSave({ title: event.target.value });
  };

  const handleDateChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setActionDate(value);
    scheduleSave({ actionDate: value || null });
  };

  const handleWaitingToggle = () => {
    const id = taskIdRef.current;
    if (!id) return;
    const next = !waiting;
    setWaiting(next);
    if (next) setSomeday(false);
    void updateTask(id, { waiting: next, ...(next ? { someday: false } : {}) });
  };

  const handleSomedayToggle = () => {
    const id = taskIdRef.current;
    if (!id) return;
    const next = !someday;
    setSomeday(next);
    if (next) setWaiting(false);
    void updateTask(id, { someday: next, ...(next ? { waiting: false } : {}) });
  };

  const handleNotesChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNotes(event.target.value);
    scheduleSave({ notes: event.target.value });
  };

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

  const handleClearDate = () => {
    const id = taskIdRef.current;
    if (!id) return;
    setActionDate("");
    void updateTask(id, { actionDate: null });
  };

  const formattedDate = formatDate(actionDate, today);
  const isCompleted = Boolean(selectedTask?.completedAt);

  const renderBody = () => {
    if (isLoadingTask && selectedTaskId) {
      return (
        <PanelEmptyState
          title="Loading task"
          message="Opening task details."
        />
      );
    }

    if (!selectedTaskId || !selectedTask) {
      return (
        <PanelEmptyState
          title="No task selected"
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
              <svg viewBox="0 0 10 8" className="h-2.5 w-2.5 stroke-current stroke-[2.5] fill-none">
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
            <button
              type="button"
              onClick={() =>
                dateInputRef.current?.showPicker?.() ?? dateInputRef.current?.focus()
              }
              className={cn(
                "ui-focus-ring inline-flex h-[var(--ui-control-height-compact)] items-center gap-1.5 rounded-[var(--ui-radius-md)] px-2.5 text-xs transition-colors",
                actionDate
                  ? "text-text-muted hover:bg-bg-muted hover:text-text"
                  : "text-text-muted/60 hover:bg-bg-muted hover:text-text-muted",
              )}
            >
              <CalendarDays className="h-3.5 w-3.5 shrink-0 stroke-[1.6]" />
              <span>{formattedDate}</span>
            </button>

            <input
              ref={dateInputRef}
              type="date"
              value={actionDate}
              onChange={handleDateChange}
              onBlur={flushSave}
              className="pointer-events-none absolute h-0 w-0 opacity-0"
              aria-hidden="true"
            />

            {actionDate && (
              <button
                type="button"
                onClick={handleClearDate}
                className="ui-focus-ring inline-flex h-[var(--ui-control-height-compact)] items-center rounded-[var(--ui-radius-md)] px-2.5 text-xs text-text-muted/70 transition-colors hover:bg-bg-muted hover:text-text"
              >
                Clear Date
              </button>
            )}

            <button
              type="button"
              onClick={handleWaitingToggle}
              className={cn(
                "ui-focus-ring inline-flex h-[var(--ui-control-height-compact)] items-center rounded-[var(--ui-radius-md)] border px-2.5 text-xs transition-colors",
                waiting
                  ? "border-accent/35 bg-bg-muted text-text"
                  : "border-border text-text-muted hover:border-border-solid hover:text-text",
              )}
            >
              Waiting
            </button>

            <button
              type="button"
              onClick={handleSomedayToggle}
              className={cn(
                "ui-focus-ring inline-flex h-[var(--ui-control-height-compact)] items-center rounded-[var(--ui-radius-md)] border px-2.5 text-xs transition-colors",
                someday
                  ? "border-accent/35 bg-bg-muted text-text"
                  : "border-border text-text-muted hover:border-border-solid hover:text-text",
              )}
            >
              Someday
            </button>
          </div>

          <div />
          <div className="border-t border-border/40" />

          <div />
          <div className="space-y-2">
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted/65">
              Notes
            </div>
            <textarea
              value={notes}
              placeholder="Add notes…"
              onChange={handleNotesChange}
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
        <button
          type="button"
          onClick={() => selectTask(null)}
          className="ui-focus-ring -ml-1 inline-flex items-center gap-1 rounded-[var(--ui-radius-md)] px-1.5 py-1 text-sm text-text-muted transition-colors hover:bg-bg-muted hover:text-text"
        >
          <ChevronLeft className="h-4 w-4 shrink-0 stroke-[1.8]" />
          <span>{TASK_VIEW_LABELS[selectedView]}</span>
        </button>
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
        {renderBody()}
      </div>
    </div>
  );
}

function formatDate(date: string, today: string): string {
  if (!date) return "Set date";
  if (date === today) return "Today";
  const tomorrow = offsetDate(today, 1);
  if (date === tomorrow) return "Tomorrow";
  const [y, m, d] = date.split("-").map(Number);
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const todayYear = Number(today.split("-")[0]);
  return `${names[m - 1]} ${d}${y !== todayYear ? `, ${y}` : ""}`;
}

function offsetDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

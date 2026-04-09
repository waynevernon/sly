import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarDays, Trash2 } from "lucide-react";
import { useTasks } from "../../context/TasksContext";
import { cn } from "../../lib/utils";
import type { TaskPatch } from "../../types/tasks";

const DEBOUNCE_MS = 600;

export function TaskDetailPanel() {
  const {
    selectedTask,
    selectedTaskId,
    isLoadingTask,
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
        const p = pendingPatchRef.current;
        if (!id || Object.keys(p).length === 0) return;
        pendingPatchRef.current = {};
        void updateTask(id, p);
      }, DEBOUNCE_MS);
    },
    [updateTask]
  );

  const flushSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const id = taskIdRef.current;
    const p = pendingPatchRef.current;
    if (!id || Object.keys(p).length === 0) return;
    pendingPatchRef.current = {};
    void updateTask(id, p);
  }, [updateTask]);

  useEffect(() => {
    return () => { flushSave(); };
  }, [flushSave]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value);
    scheduleSave({ title: e.target.value });
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setActionDate(v);
    scheduleSave({ actionDate: v || null });
  };

  const handleWaitingToggle = () => {
    const next = !waiting;
    setWaiting(next);
    if (next) setSomeday(false);
    void updateTask(taskIdRef.current!, { waiting: next, ...(next ? { someday: false } : {}) });
  };

  const handleSomedayToggle = () => {
    const next = !someday;
    setSomeday(next);
    if (next) setWaiting(false);
    void updateTask(taskIdRef.current!, { someday: next, ...(next ? { waiting: false } : {}) });
  };

  const handleNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNotes(e.target.value);
    scheduleSave({ notes: e.target.value });
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

  const formattedDate = formatDate(actionDate, today);

  if (!selectedTaskId || isLoadingTask || !selectedTask) {
    return null;
  }

  const isCompleted = Boolean(selectedTask.completedAt);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="ui-scrollbar-overlay flex-1 overflow-y-auto px-4 py-4">

        {/* Title row */}
        <div className="flex items-start gap-2.5">
          {/* Completion circle */}
          <button
            type="button"
            aria-label={isCompleted ? "Mark incomplete" : "Mark complete"}
            onClick={() => void handleToggleComplete()}
            className={cn(
              "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors outline-none",
              "focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-1",
              isCompleted
                ? "border-accent bg-accent text-text-inverse"
                : "border-border hover:border-accent/60"
            )}
          >
            {isCompleted && (
              <svg viewBox="0 0 10 8" className="h-2 w-2 stroke-current stroke-[2.5] fill-none">
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
            className="min-w-0 flex-1 bg-transparent text-sm font-medium text-text outline-none placeholder:text-text-muted/50 leading-snug"
          />

          <button
            type="button"
            aria-label="Delete task"
            onClick={() => void handleDelete()}
            className="mt-0.5 shrink-0 flex h-5 w-5 items-center justify-center rounded-md text-text-muted/40 hover:text-red-500 dark:hover:text-red-400 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5 stroke-[1.6]" />
          </button>
        </div>

        {/* Metadata row: date + state pills */}
        <div className="mt-2.5 ml-6.5 flex flex-wrap items-center gap-1.5">
          {/* Date chip */}
          <button
            type="button"
            onClick={() => dateInputRef.current?.showPicker?.() ?? dateInputRef.current?.focus()}
            className={cn(
              "flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs transition-colors",
              actionDate
                ? "text-text-muted hover:text-text hover:bg-bg-muted/60"
                : "text-text-muted/50 hover:text-text-muted hover:bg-bg-muted/60"
            )}
          >
            <CalendarDays className="h-3 w-3 stroke-[1.6] shrink-0" />
            <span>{formattedDate}</span>
          </button>

          {/* Hidden native date input */}
          <input
            ref={dateInputRef}
            type="date"
            value={actionDate}
            onChange={handleDateChange}
            onBlur={flushSave}
            className="absolute opacity-0 w-0 h-0 pointer-events-none"
            aria-hidden="true"
          />

          {/* Clear date — only when set */}
          {actionDate && (
            <button
              type="button"
              onClick={() => {
                setActionDate("");
                void updateTask(taskIdRef.current!, { actionDate: null });
              }}
              className="rounded-md px-1.5 py-0.5 text-xs text-text-muted/50 hover:text-text-muted hover:bg-bg-muted/60 transition-colors"
            >
              Clear
            </button>
          )}

          {/* Waiting pill */}
          <button
            type="button"
            onClick={handleWaitingToggle}
            className={cn(
              "rounded-md px-1.5 py-0.5 text-xs border transition-colors",
              waiting
                ? "border-accent/40 bg-accent/8 text-accent"
                : "border-border/60 text-text-muted/60 hover:border-border hover:text-text-muted"
            )}
          >
            Waiting
          </button>

          {/* Someday pill */}
          <button
            type="button"
            onClick={handleSomedayToggle}
            className={cn(
              "rounded-md px-1.5 py-0.5 text-xs border transition-colors",
              someday
                ? "border-accent/40 bg-accent/8 text-accent"
                : "border-border/60 text-text-muted/60 hover:border-border hover:text-text-muted"
            )}
          >
            Someday
          </button>
        </div>

        {/* Divider */}
        <div className="mt-4 ml-6.5 border-t border-border/30" />

        {/* Notes — plain writing surface */}
        <textarea
          value={notes}
          placeholder="Add notes…"
          onChange={handleNotesChange}
          onBlur={flushSave}
          rows={10}
          className="mt-3 ml-6.5 block w-[calc(100%-1.625rem)] resize-none bg-transparent text-sm text-text outline-none placeholder:text-text-muted/40 leading-relaxed"
        />
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

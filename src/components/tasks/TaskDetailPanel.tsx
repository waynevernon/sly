import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Trash2,
  X,
} from "lucide-react";
import { useTasks } from "../../context/TasksContext";
import {
  actionAtToLocalDate,
  localDateString,
  localDateToNormalizedActionAt,
} from "../../lib/tasks";
import { cn } from "../../lib/utils";
import type { TaskPatch } from "../../types/tasks";
import { IconButton, PanelEmptyState, PopoverSurface } from "../ui";

const DEBOUNCE_MS = 600;
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

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
  const [description, setDescription] = useState("");

  const taskIdRef = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPatchRef = useRef<TaskPatch>({});

  useEffect(() => {
    if (!selectedTask) return;
    taskIdRef.current = selectedTask.id;
    setTitle(selectedTask.title);
    setActionDate(actionAtToLocalDate(selectedTask.actionAt) ?? "");
    setDescription(selectedTask.description);
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

  const handleDescriptionChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDescription(event.target.value);
    scheduleSave({ description: event.target.value });
  };

  const commitActionDate = useCallback(
    (nextDate: string | null) => {
      setActionDate(nextDate ?? "");
      scheduleSave({ actionAt: localDateToNormalizedActionAt(nextDate) });
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

  const formattedDate = formatDate(actionDate, today);
  const isCompleted = Boolean(selectedTask?.completedAt);
  const showEmptyState = (isLoadingTask && selectedTaskId) || !selectedTaskId || !selectedTask;

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
              value={actionDate}
              today={today}
              formattedValue={formattedDate}
              onSelectDate={commitActionDate}
              onClearDate={() => commitActionDate(null)}
            />

            {actionDate && (
              <button
                type="button"
                onClick={() => commitActionDate(null)}
                className="ui-focus-ring inline-flex h-[var(--ui-control-height-standard)] items-center gap-1.5 rounded-[var(--ui-radius-md)] px-3 text-sm text-text-muted transition-colors hover:bg-bg-muted hover:text-text"
              >
                <X className="h-3.5 w-3.5 shrink-0 stroke-[1.8]" />
                <span>Clear Date</span>
              </button>
            )}
          </div>

          <div />
          <div className="border-t border-border/40" />

          <div />
          <div className="space-y-2">
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted/65">
              Description
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

function TaskDatePicker({
  value,
  today,
  formattedValue,
  onSelectDate,
  onClearDate,
}: {
  value: string;
  today: string;
  formattedValue: string;
  onSelectDate: (date: string) => void;
  onClearDate: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(value || today));
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setVisibleMonth(startOfMonth(value || today));
  }, [isOpen, today, value]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!popoverRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const weeks = useMemo(() => buildMonthGrid(visibleMonth), [visibleMonth]);
  const monthLabel = `${MONTH_LABELS[visibleMonth.getMonth()]} ${visibleMonth.getFullYear()}`;
  const tomorrow = offsetDate(today, 1);

  return (
    <div ref={popoverRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className={cn(
          "ui-focus-ring inline-flex h-[var(--ui-control-height-standard)] items-center gap-2 rounded-[var(--ui-radius-md)] px-3 text-sm transition-colors",
          value
            ? "bg-bg-muted/70 text-text hover:bg-bg-muted"
            : "text-text-muted hover:bg-bg-muted hover:text-text",
        )}
      >
        <CalendarDays className="h-4 w-4 shrink-0 stroke-[1.7]" />
        <span>{formattedValue}</span>
      </button>

      {isOpen && (
        <PopoverSurface className="absolute left-0 top-[calc(100%+8px)] z-30 w-80 p-2.5">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-text">{monthLabel}</div>
              <div className="flex items-center gap-1">
                <IconButton
                  type="button"
                  size="xs"
                  variant="ghost"
                  title="Previous Month"
                  onClick={() => setVisibleMonth((month) => addMonths(month, -1))}
                >
                  <ChevronLeft className="h-4 w-4 stroke-[1.8]" />
                </IconButton>
                <IconButton
                  type="button"
                  size="xs"
                  variant="ghost"
                  title="Next Month"
                  onClick={() => setVisibleMonth((month) => addMonths(month, 1))}
                >
                  <ChevronRight className="h-4 w-4 stroke-[1.8]" />
                </IconButton>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <QuickDateButton
                label="Today"
                isActive={value === today}
                onClick={() => {
                  onSelectDate(today);
                  setIsOpen(false);
                }}
              />
              <QuickDateButton
                label="Tomorrow"
                isActive={value === tomorrow}
                onClick={() => {
                  onSelectDate(tomorrow);
                  setIsOpen(false);
                }}
              />
              {value ? (
                <QuickDateButton
                  label="Clear"
                  onClick={() => {
                    onClearDate();
                    setIsOpen(false);
                  }}
                />
              ) : null}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {WEEKDAY_LABELS.map((label) => (
                <div
                  key={label}
                  className="flex h-8 items-center justify-center text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted/65"
                >
                  {label}
                </div>
              ))}
              {weeks.flat().map((day) => {
                const isSelected = day.date === value;
                const isToday = day.date === today;

                return (
                  <button
                    key={day.date}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => {
                      onSelectDate(day.date);
                      setIsOpen(false);
                    }}
                    className={cn(
                      "ui-focus-ring flex h-9 items-center justify-center rounded-[var(--ui-radius-md)] text-sm transition-colors",
                      isSelected
                        ? "bg-bg-muted text-text"
                        : day.inCurrentMonth
                          ? "text-text hover:bg-bg-muted"
                          : "text-text-muted/50 hover:bg-bg-muted/70",
                      isToday && !isSelected ? "ring-1 ring-border" : "",
                    )}
                  >
                    {day.day}
                  </button>
                );
              })}
            </div>
          </div>
        </PopoverSurface>
      )}
    </div>
  );
}

function QuickDateButton({
  label,
  isActive = false,
  onClick,
}: {
  label: string;
  isActive?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "ui-focus-ring inline-flex h-[var(--ui-control-height-compact)] items-center rounded-[var(--ui-radius-md)] px-2.5 text-xs font-medium transition-colors",
        isActive
          ? "bg-bg-muted text-text"
          : "text-text-muted hover:bg-bg-muted hover:text-text",
      )}
    >
      {label}
    </button>
  );
}

function buildMonthGrid(month: Date): Array<Array<{ date: string; day: number; inCurrentMonth: boolean }>> {
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - monthStart.getDay());

  return Array.from({ length: 6 }, (_, weekIndex) =>
    Array.from({ length: 7 }, (_, dayIndex) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + weekIndex * 7 + dayIndex);
      return {
        date: localDateString(date),
        day: date.getDate(),
        inCurrentMonth: date.getMonth() === monthStart.getMonth(),
      };
    }),
  );
}

function startOfMonth(value: string): Date {
  const parsed = parseLocalDate(value);
  return new Date(parsed.getFullYear(), parsed.getMonth(), 1);
}

function addMonths(date: Date, offset: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + offset, 1);
}

function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    return new Date();
  }

  return new Date(year, month - 1, day);
}

function formatDate(date: string, today: string): string {
  if (!date) return "Set date";
  if (date === today) return "Today";
  const tomorrow = offsetDate(today, 1);
  if (date === tomorrow) return "Tomorrow";
  const [y, m, d] = date.split("-").map(Number);
  const todayYear = Number(today.split("-")[0]);
  return `${MONTH_LABELS[m - 1].slice(0, 3)} ${d}${y !== todayYear ? `, ${y}` : ""}`;
}

function offsetDate(date: string, days: number): string {
  const d = parseLocalDate(date);
  d.setDate(d.getDate() + days);
  return localDateString(d);
}

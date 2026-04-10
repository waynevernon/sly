import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import {
  formatTaskDate,
  localDateString,
  TASK_SCHEDULE_BUCKET_LABELS,
} from "../../lib/tasks";
import type { TaskScheduleBucket } from "../../types/tasks";
import { cn } from "../../lib/utils";
import { IconButton, PopoverSurface } from "../ui";

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

interface TaskDatePickerProps {
  actionDate: string;
  scheduleBucket: TaskScheduleBucket | null;
  today: string;
  onChange: (selection: {
    actionDate: string | null;
    scheduleBucket: TaskScheduleBucket | null;
  }) => void;
  className?: string;
}

export function TaskDatePicker({
  actionDate,
  scheduleBucket,
  today,
  onChange,
  className,
}: TaskDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(actionDate || today));
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setVisibleMonth(startOfMonth(actionDate || today));
  }, [actionDate, isOpen, today]);

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

  const formattedValue = scheduleBucket
    ? TASK_SCHEDULE_BUCKET_LABELS[scheduleBucket]
    : actionDate
      ? formatTaskDate(actionDate, today)
      : "Set date";
  const weeks = useMemo(() => buildMonthGrid(visibleMonth), [visibleMonth]);
  const monthLabel = `${MONTH_LABELS[visibleMonth.getMonth()]} ${visibleMonth.getFullYear()}`;
  const tomorrow = offsetDate(today, 1);
  const hasSelection = Boolean(actionDate || scheduleBucket);

  return (
    <div ref={popoverRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className={cn(
          "ui-focus-ring inline-flex h-[var(--ui-control-height-standard)] items-center gap-2 rounded-[var(--ui-radius-md)] px-3 text-sm transition-colors",
          hasSelection
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
                isActive={actionDate === today}
                onClick={() => {
                  onChange({ actionDate: today, scheduleBucket: null });
                  setIsOpen(false);
                }}
              />
              <QuickDateButton
                label="Tomorrow"
                isActive={actionDate === tomorrow}
                onClick={() => {
                  onChange({ actionDate: tomorrow, scheduleBucket: null });
                  setIsOpen(false);
                }}
              />
              <QuickDateButton
                label="Anytime"
                isActive={scheduleBucket === "anytime"}
                onClick={() => {
                  onChange({ actionDate: null, scheduleBucket: "anytime" });
                  setIsOpen(false);
                }}
              />
              <QuickDateButton
                label="Someday"
                isActive={scheduleBucket === "someday"}
                onClick={() => {
                  onChange({ actionDate: null, scheduleBucket: "someday" });
                  setIsOpen(false);
                }}
              />
              {hasSelection ? (
                <QuickDateButton
                  label="Clear"
                  onClick={() => {
                    onChange({ actionDate: null, scheduleBucket: null });
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
                const isSelected = day.date === actionDate;
                const isToday = day.date === today;

                return (
                  <button
                    key={day.date}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => {
                      onChange({ actionDate: day.date, scheduleBucket: null });
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

function offsetDate(date: string, days: number): string {
  const d = parseLocalDate(date);
  d.setDate(d.getDate() + days);
  return localDateString(d);
}

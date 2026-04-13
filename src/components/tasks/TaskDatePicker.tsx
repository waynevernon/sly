import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Archive,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  RotateCcw,
  Sun,
  Sunrise,
} from "lucide-react";
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
  const [popoverPosition, setPopoverPosition] = useState<{ left: number; top: number } | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const width = 320;
      const margin = 8;
      const left = Math.min(
        Math.max(margin, rect.left),
        Math.max(margin, window.innerWidth - width - margin),
      );
      const preferredTop = rect.bottom + 8;
      const aboveTop = rect.top - 8;
      const estimatedHeight = 360;
      const top =
        preferredTop + estimatedHeight <= window.innerHeight || aboveTop < estimatedHeight
          ? preferredTop
          : Math.max(margin, rect.top - estimatedHeight - 8);
      setPopoverPosition({ left, top });
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !popoverRef.current?.contains(target) &&
        !triggerRef.current?.contains(target)
      ) {
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
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    updatePosition();
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen]);

  const formattedValue = scheduleBucket
    ? TASK_SCHEDULE_BUCKET_LABELS[scheduleBucket]
    : actionDate
      ? formatTaskDate(actionDate, today)
      : "Set date";

  return (
    <div className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className={cn(
          "ui-focus-ring inline-flex h-[var(--ui-control-height-standard)] items-center gap-2 rounded-[var(--ui-radius-md)] px-3 text-sm transition-colors",
          actionDate || scheduleBucket
            ? "bg-bg-muted/70 text-text hover:bg-bg-muted"
            : "text-text-muted hover:bg-bg-muted hover:text-text",
        )}
      >
        <CalendarDays className="h-4 w-4 shrink-0 stroke-[1.7]" />
        <span>{formattedValue}</span>
      </button>

      {isOpen && popoverPosition
        ? createPortal(
            <PopoverSurface
              ref={popoverRef}
              className="fixed z-[100] w-80 p-2.5"
              style={{ left: popoverPosition.left, top: popoverPosition.top }}
            >
              <TaskDatePickerPanel
                today={today}
                actionDate={actionDate || null}
                scheduleBucket={scheduleBucket}
                onSelect={(selection) => {
                  onChange(selection);
                  setIsOpen(false);
                }}
              />
            </PopoverSurface>,
            document.body,
          )
        : null}
    </div>
  );
}

export function TaskDatePickerPanel({
  today,
  actionDate,
  scheduleBucket,
  onSelect,
}: {
  today: string;
  actionDate: string | null;
  scheduleBucket: TaskScheduleBucket | null;
  onSelect: (selection: {
    actionDate: string | null;
    scheduleBucket: TaskScheduleBucket | null;
  }) => void;
}) {
  // visibleMonth state lives here so it initializes fresh each time the panel mounts
  // (i.e. each time the picker opens), naturally tracking the current actionDate.
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(actionDate || today));
  const weeks = useMemo(() => buildMonthGrid(visibleMonth), [visibleMonth]);
  const monthLabel = `${MONTH_LABELS[visibleMonth.getMonth()]} ${visibleMonth.getFullYear()}`;
  const tomorrow = offsetDate(today, 1);
  const nextWeek = nextMonday(today);
  const hasSelection = Boolean(actionDate || scheduleBucket);

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-1.5">
        <QuickDateButton
          label="Today"
          icon={<Sun className="h-3.5 w-3.5 stroke-[1.8]" />}
          isActive={actionDate === today}
          onClick={() => onSelect({ actionDate: today, scheduleBucket: null })}
        />
        <QuickDateButton
          label="Tomorrow"
          icon={<Sunrise className="h-3.5 w-3.5 stroke-[1.8]" />}
          isActive={actionDate === tomorrow}
          onClick={() => onSelect({ actionDate: tomorrow, scheduleBucket: null })}
        />
        <QuickDateButton
          label="Next week"
          icon={<CalendarDays className="h-3.5 w-3.5 stroke-[1.8]" />}
          isActive={actionDate === nextWeek}
          onClick={() => onSelect({ actionDate: nextWeek, scheduleBucket: null })}
        />
        <QuickDateButton
          label="Anytime"
          icon={<Clock3 className="h-3.5 w-3.5 stroke-[1.8]" />}
          isActive={scheduleBucket === "anytime"}
          onClick={() => onSelect({ actionDate: null, scheduleBucket: "anytime" })}
        />
        <QuickDateButton
          label="Someday"
          icon={<Archive className="h-3.5 w-3.5 stroke-[1.8]" />}
          isActive={scheduleBucket === "someday"}
          onClick={() => onSelect({ actionDate: null, scheduleBucket: "someday" })}
        />
        {hasSelection ? (
          <QuickDateButton
            label="Clear"
            icon={<RotateCcw className="h-3.5 w-3.5 stroke-[1.8]" />}
            onClick={() => onSelect({ actionDate: null, scheduleBucket: null })}
          />
        ) : null}
      </div>

      <div className="border-t border-border/60 pt-2">
        <div className="flex items-center justify-between pb-1">
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
                onClick={() => onSelect({ actionDate: day.date, scheduleBucket: null })}
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
    </div>
  );
}

function QuickDateButton({
  label,
  icon,
  isActive = false,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  isActive?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "ui-focus-ring inline-flex h-[var(--ui-control-height-standard)] items-center gap-2 rounded-[var(--ui-radius-md)] px-2.5 text-xs font-medium transition-colors",
        isActive
          ? "bg-bg-muted text-text"
          : "text-text-muted hover:bg-bg-muted hover:text-text",
      )}
    >
      <span className="shrink-0 text-current">{icon}</span>
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

function nextMonday(date: string): string {
  const current = parseLocalDate(date);
  const day = current.getDay();
  const daysUntilMonday = ((8 - day) % 7) || 7;
  current.setDate(current.getDate() + daysUntilMonday);
  return localDateString(current);
}

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Repeat2, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { PopoverSurface } from "../ui";

// ─── Rule codec ──────────────────────────────────────────────────────────────

export type RecurrencePeriod = "daily" | "weekday" | "weekly" | "monthly" | "yearly";
export type RecurrenceMode = "completion" | "schedule";

export interface ParsedRecurrence {
  period: RecurrencePeriod;
  mode: RecurrenceMode;
  anchorDay?: number;
}

export function parseRecurrence(rule: string | null): ParsedRecurrence | null {
  if (!rule) return null;
  const parts = rule.split(":");
  if (parts.length < 2) return null;
  const period = parts[0] as RecurrencePeriod;
  const mode = parts[1] as RecurrenceMode;
  if (!["daily", "weekday", "weekly", "monthly", "yearly"].includes(period)) return null;
  if (!["completion", "schedule"].includes(mode)) return null;
  const anchorDay = parts[2] ? parseInt(parts[2], 10) : undefined;
  return { period, mode, anchorDay };
}

export function buildRecurrenceRule(
  period: RecurrencePeriod,
  mode: RecurrenceMode,
  actionDate: string,
): string {
  if (period === "monthly" && mode === "schedule") {
    const day = actionDate ? parseInt(actionDate.split("-")[2], 10) : 1;
    return `monthly:schedule:${day}`;
  }
  return `${period}:${mode}`;
}

// ─── Display labels ───────────────────────────────────────────────────────────

const PERIOD_LABELS: Record<RecurrencePeriod, string> = {
  daily: "Daily",
  weekday: "Every weekday",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

const PERIOD_SHORT_LABELS: Record<RecurrencePeriod, string> = {
  daily: "Daily",
  weekday: "Weekdays",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

const MODE_LABELS: Record<RecurrenceMode, string> = {
  completion: "After completion",
  schedule: "On schedule",
};

const ALL_PERIODS: RecurrencePeriod[] = ["daily", "weekday", "weekly", "monthly", "yearly"];

function ordinal(n: number): string {
  const v = n % 100;
  const suffix = v >= 11 && v <= 13
    ? "th"
    : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${suffix}`;
}

function pillLabel(parsed: ParsedRecurrence, actionDate: string): string {
  const { period, mode, anchorDay } = parsed;

  if (mode === "completion") {
    return `${PERIOD_SHORT_LABELS[period]} · After completion`;
  }

  // Schedule mode — show the specific anchor when meaningful
  switch (period) {
    case "daily":
      return "Daily";
    case "weekday":
      return "Every weekday";
    case "weekly": {
      if (actionDate) {
        const d = new Date(`${actionDate}T12:00:00`);
        return `Weekly on ${d.toLocaleDateString(undefined, { weekday: "long" })}`;
      }
      return "Weekly · On schedule";
    }
    case "monthly": {
      if (anchorDay) return `Monthly on the ${ordinal(anchorDay)}`;
      return "Monthly · On schedule";
    }
    case "yearly": {
      if (actionDate) {
        const d = new Date(`${actionDate}T12:00:00`);
        return `Yearly on ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
      }
      return "Yearly · On schedule";
    }
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

interface RecurrencePickerProps {
  recurrence: string | null;
  actionDate: string;  // YYYY-MM-DD, needed for monthly:schedule anchor day
  onChange: (recurrence: string | null) => void;
}

export function RecurrencePicker({ recurrence, actionDate, onChange }: RecurrencePickerProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const parsed = parseRecurrence(recurrence);

  const handleOpen = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const panelHeight = 220;
    const panelWidth = 210;
    const minTop = 56;
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    let top: number;
    if (spaceBelow >= panelHeight) {
      top = rect.bottom + 8;
    } else {
      const above = rect.top - 8 - panelHeight;
      top = above >= minTop ? above : Math.max(minTop, rect.bottom + 8);
    }
    const left = Math.min(rect.left, window.innerWidth - panelWidth - 8);
    setPosition({ top, left });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node) &&
        !triggerRef.current?.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handlePick = (period: RecurrencePeriod, mode: RecurrenceMode) => {
    onChange(buildRecurrenceRule(period, mode, actionDate));
    setOpen(false);
  };

  const handleClear = () => {
    onChange(null);
    setOpen(false);
  };

  return (
    <>
      {parsed ? (
        <button
          ref={triggerRef}
          type="button"
          onClick={handleOpen}
          className="ui-focus-ring inline-flex h-[var(--ui-control-height-standard)] max-w-[280px] items-center gap-2 rounded-[var(--ui-radius-md)] bg-bg-muted/70 px-3 text-sm text-text transition-colors hover:bg-bg-muted"
        >
          <Repeat2 className="h-4 w-4 shrink-0 stroke-[1.7] text-text-muted" />
          <span className="truncate">{pillLabel(parsed, actionDate)}</span>
        </button>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          onClick={handleOpen}
          className="ui-focus-ring inline-flex h-[var(--ui-control-height-standard)] items-center gap-2 rounded-[var(--ui-radius-md)] px-3 text-sm text-text-muted/70 transition-colors hover:bg-bg-muted hover:text-text-muted"
        >
          <Repeat2 className="h-4 w-4 shrink-0 stroke-[1.7]" />
          <span>Repeat</span>
        </button>
      )}

      {open && position &&
        createPortal(
          <div
            ref={panelRef}
            style={{ top: position.top, left: position.left, width: 210 }}
            className="fixed z-50"
          >
            <RecurrencePanel
              parsed={parsed}
              actionDate={actionDate}
              onPick={handlePick}
              onClear={handleClear}
            />
          </div>,
          document.body,
        )}
    </>
  );
}

// ─── Panel (two-step) ─────────────────────────────────────────────────────────

interface RecurrencePanelProps {
  parsed: ParsedRecurrence | null;
  actionDate: string;
  onPick: (period: RecurrencePeriod, mode: RecurrenceMode) => void;
  onClear: () => void;
}

function RecurrencePanel({ parsed, onPick, onClear }: RecurrencePanelProps) {
  const [pendingPeriod, setPendingPeriod] = useState<RecurrencePeriod | null>(
    parsed?.period ?? null,
  );

  return (
    <PopoverSurface className="p-1.5">
      {pendingPeriod === null ? (
        // Step 1: pick a period
        <div className="flex flex-col gap-0.5">
          <div className="px-2 pb-1 pt-0.5 text-[11px] font-medium text-text-muted/60">
            Repeats
          </div>
          {ALL_PERIODS.map((period) => (
            <button
              key={period}
              type="button"
              onClick={() => setPendingPeriod(period)}
              className="ui-focus-ring flex w-full items-center gap-2 rounded-[var(--ui-radius-md)] px-2.5 py-2 text-left text-sm text-text transition-colors hover:bg-bg-muted"
            >
              <Repeat2 className="h-3.5 w-3.5 shrink-0 stroke-[1.8] text-text-muted" />
              <span>{PERIOD_LABELS[period]}</span>
            </button>
          ))}
          {parsed && (
            <>
              <div className="mx-2 my-1 border-t border-border/40" />
              <button
                type="button"
                onClick={onClear}
                className="ui-focus-ring flex w-full items-center gap-2 rounded-[var(--ui-radius-md)] px-2.5 py-2 text-left text-sm text-text-muted transition-colors hover:bg-bg-muted hover:text-text"
              >
                <X className="h-3.5 w-3.5 shrink-0 stroke-[1.8]" />
                <span>Remove recurrence</span>
              </button>
            </>
          )}
        </div>
      ) : (
        // Step 2: pick a mode
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1 px-1 pb-1 pt-0.5">
            <button
              type="button"
              onClick={() => setPendingPeriod(null)}
              className={cn(
                "ui-focus-ring inline-flex h-6 w-6 items-center justify-center rounded-[var(--ui-radius-sm)]",
                "text-text-muted transition-colors hover:bg-bg-muted hover:text-text",
              )}
              aria-label="Back to period selection"
            >
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-current stroke-[1.8]">
                <polyline points="10,3 5,8 10,13" />
              </svg>
            </button>
            <span className="text-[11px] font-medium text-text-muted/60">
              {PERIOD_LABELS[pendingPeriod]}
            </span>
          </div>
          {(["completion", "schedule"] as RecurrenceMode[]).map((mode) => {
            const isActive = parsed?.period === pendingPeriod && parsed?.mode === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => onPick(pendingPeriod, mode)}
                className={cn(
                  "ui-focus-ring flex w-full items-center gap-2 rounded-[var(--ui-radius-md)] px-2.5 py-2 text-left text-sm transition-colors hover:bg-bg-muted",
                  isActive ? "text-text font-medium" : "text-text",
                )}
              >
                <span
                  className={cn(
                    "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border",
                    isActive ? "border-accent bg-accent" : "border-border",
                  )}
                >
                  {isActive && (
                    <span className="h-1.5 w-1.5 rounded-full bg-white" />
                  )}
                </span>
                <span>{MODE_LABELS[mode]}</span>
              </button>
            );
          })}
        </div>
      )}
    </PopoverSurface>
  );
}

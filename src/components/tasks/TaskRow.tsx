import { cn } from "../../lib/utils";
import { actionAtToLocalDate, isOverdue } from "../../lib/tasks";
import type { TaskMetadata, TaskView } from "../../types/tasks";

interface TaskRowProps {
  task: TaskMetadata;
  view: TaskView;
  today: string;
  isSelected: boolean;
  onSelect: () => void;
  onToggleComplete: () => void;
}

export function TaskRow({
  task,
  view,
  today,
  isSelected,
  onSelect,
  onToggleComplete,
}: TaskRowProps) {
  const isCompleted = Boolean(task.completedAt);
  const overdue = !isCompleted && isOverdue(task, today);
  const actionDate = actionAtToLocalDate(task.actionAt);
  const secondaryLabel = task.completedAt && view === "completed"
    ? formatCompletedAt(task.completedAt)
    : actionDate && view !== "completed"
      ? formatDate(actionDate, today)
      : null;

  return (
    <div
      role="option"
      aria-selected={isSelected}
      className="group rounded-md"
    >
      <div
        className={cn(
          "flex items-start gap-2.5 rounded-md pl-2.5 pr-2.5 transition-colors duration-100",
          secondaryLabel ? "py-2.25" : "py-1.75",
          isSelected ? "bg-bg-muted" : "hover:bg-bg-muted",
        )}
      >
        <button
          type="button"
          aria-label={isCompleted ? "Mark incomplete" : "Mark complete"}
          onClick={onToggleComplete}
          className={cn(
            "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors outline-none",
            "focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-1",
            isCompleted
              ? "border-accent bg-accent text-text-inverse"
              : "border-border bg-bg hover:border-accent/60",
          )}
        >
          {isCompleted && (
            <svg viewBox="0 0 10 8" className="h-2 w-2 fill-none stroke-current stroke-[2.5]">
              <polyline points="1,4 4,7 9,1" />
            </svg>
          )}
        </button>

        <button
          type="button"
          onClick={onSelect}
          className="ui-focus-ring min-w-0 flex-1 text-left outline-none"
        >
          <span
            className={cn(
              "block truncate text-sm font-medium",
              isCompleted ? "text-text-muted line-through" : "text-text",
            )}
          >
            {task.title || "Untitled"}
          </span>

          {secondaryLabel && (
            <span
              className={cn(
                "mt-0.5 block text-xs leading-none tabular-nums",
                overdue ? "text-red-500 dark:text-red-400" : "text-text-muted/60",
              )}
            >
              {secondaryLabel}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

function formatDate(date: string, today: string): string {
  if (date === today) return "Today";
  const tomorrow = offsetDate(today, 1);
  if (date === tomorrow) return "Tomorrow";
  const [y, m, d] = date.split("-").map(Number);
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const todayYear = Number(today.split("-")[0]);
  return `${names[m - 1]} ${d}${y !== todayYear ? `, ${y}` : ""}`;
}

function formatCompletedAt(iso: string): string {
  const date = iso.split("T")[0];
  const [y, m, d] = date.split("-").map(Number);
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `Completed ${names[m - 1]} ${d}, ${y}`;
}

function offsetDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

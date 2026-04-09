import { cn } from "../../lib/utils";
import { isOverdue } from "../../lib/tasks";
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

  return (
    <div
      role="option"
      aria-selected={isSelected}
      onClick={onSelect}
      className={cn(
        "group flex items-center gap-2 cursor-default rounded-md px-2 py-1.5 transition-colors duration-100",
        isSelected ? "bg-bg-muted" : "hover:bg-bg-muted/70"
      )}
    >
      {/* Completion circle */}
      <button
        type="button"
        aria-label={isCompleted ? "Mark incomplete" : "Mark complete"}
        onClick={(e) => {
          e.stopPropagation();
          onToggleComplete();
        }}
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors outline-none",
          "focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-1",
          isCompleted
            ? "border-accent bg-accent text-text-inverse"
            : "border-border bg-bg hover:border-accent/60"
        )}
      >
        {isCompleted && (
          <svg viewBox="0 0 10 8" className="h-2 w-2 stroke-current stroke-[2.5] fill-none">
            <polyline points="1,4 4,7 9,1" />
          </svg>
        )}
      </button>

      {/* Title + date */}
      <div className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-sm leading-snug",
            isCompleted ? "line-through text-text-muted" : "text-text"
          )}
        >
          {task.title || "Untitled"}
        </span>

        {task.actionDate && view !== "logbook" && (
          <span
            className={cn(
              "block text-xs leading-none mt-0.5 tabular-nums",
              overdue ? "text-red-500 dark:text-red-400" : "text-text-muted/60"
            )}
          >
            {formatDate(task.actionDate, today)}
          </span>
        )}

        {task.completedAt && view === "logbook" && (
          <span className="block text-xs leading-none mt-0.5 tabular-nums text-text-muted/60">
            {formatCompletedAt(task.completedAt)}
          </span>
        )}
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

import { type ReactNode, useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { CalendarDays, CheckCheck, Clock3, FileText, Flag, Link2, Repeat2, Star } from "lucide-react";
import { cn } from "../../lib/utils";
import { actionAtToLocalDate, isOverdue } from "../../lib/tasks";
import { menuSurfaceClassName } from "../ui";
import type { TaskMetadata, TaskView } from "../../types/tasks";

type SelectionState = "none" | "selected" | "active";

interface TaskRowProps {
  task: TaskMetadata;
  dragIds: string[];
  view: TaskView;
  today: string;
  selectionState: SelectionState;
  onSelect: (event: {
    shiftKey: boolean;
    metaKey: boolean;
    ctrlKey: boolean;
  }) => void;
  onContextMenuOpen: () => void;
  onToggleComplete: () => void;
  onToggleStar: () => void;
  onRename: (title: string) => void;
  contextMenu?: ReactNode;
}

export function TaskRow({
  task,
  dragIds,
  view,
  today,
  selectionState,
  onSelect,
  onContextMenuOpen,
  onToggleComplete,
  onToggleStar,
  onRename,
  contextMenu,
}: TaskRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  const isCompleted = Boolean(task.completedAt);
  const overdue = !isCompleted && isOverdue(task, today);
  const actionDate = actionAtToLocalDate(task.actionAt);
  const hasDescription = task.description.trim().length > 0;
  const hasLink = task.link.trim().length > 0;
  const hasWaitingFor = task.waitingFor.trim().length > 0;
  const hasRecurrence = Boolean(task.recurrence);
  const isCompletedViewItem = Boolean(task.completedAt && view === "completed");
  const showActionDateLabel = view !== "completed" && (view !== "today" || overdue);
  const secondaryLabel = isCompletedViewItem
    ? formatCompletedAt(task.completedAt!)
      : actionDate && showActionDateLabel
      ? formatDate(actionDate, today)
      : null;
  const dueDate = actionAtToLocalDate(task.dueAt);
  const dueDateLabel = dueDate ? formatDate(dueDate, today) : null;
  const dueOverdue = !isCompleted && dueDate !== null && dueDate < today;
  const isSelected = selectionState !== "none";
  const isActive = selectionState === "active";

  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging,
    transform,
    transition,
  } = useSortable({
    id: `task:${task.id}`,
    data: {
      type: "task",
      id: task.id,
      ids: dragIds,
      title: task.title || "Untitled",
    },
    disabled: isEditing,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const enterEditMode = () => {
    setEditValue(task.title);
    setIsEditing(true);
    // select-all after the input mounts
    setTimeout(() => editInputRef.current?.select(), 0);
  };

  const commitRename = () => {
    const trimmed = editValue.trim();
    setIsEditing(false);
    if (trimmed && trimmed !== task.title) {
      onRename(trimmed);
    }
  };

  const cancelRename = () => {
    setIsEditing(false);
  };

  const handleRenameKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitRename();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelRename();
    }
  };

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div
          ref={setNodeRef}
          style={style}
          {...attributes}
          {...listeners}
          role="option"
          aria-selected={isSelected}
          className={cn(
            "group rounded-[var(--ui-radius-md)]",
            isDragging && "opacity-40",
          )}
          onContextMenu={onContextMenuOpen}
        >
          <div
            onClick={(event) => {
              if (isEditing) return;
              onSelect({
                shiftKey: event.shiftKey,
                metaKey: event.metaKey,
                ctrlKey: event.ctrlKey,
              });
            }}
            className={cn(
              "flex cursor-pointer items-start gap-2.5 rounded-[var(--ui-radius-md)] pl-2.5 pr-2.5 transition-colors duration-100",
              secondaryLabel || dueDateLabel ? "py-[var(--ui-list-item-py-tall)]" : "py-[var(--ui-list-item-py)]",
              isActive
                ? "bg-bg-emphasis"
                : isSelected
                  ? "bg-bg-muted/75"
                  : "hover:bg-bg-muted",
            )}
          >
            <button
              type="button"
              aria-label={isCompleted ? "Mark incomplete" : "Mark complete"}
              onClick={(event) => {
                event.stopPropagation();
                onToggleComplete();
              }}
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

            {isEditing ? (
              <input
                ref={editInputRef}
                type="text"
                value={editValue}
                onChange={(event) => setEditValue(event.target.value)}
                onBlur={commitRename}
                onKeyDown={handleRenameKeyDown}
                onClick={(event) => event.stopPropagation()}
                className="min-w-0 flex-1 bg-transparent text-sm font-medium text-text outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect({
                    shiftKey: event.shiftKey,
                    metaKey: event.metaKey,
                    ctrlKey: event.ctrlKey,
                  });
                }}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  enterEditMode();
                }}
                className="ui-focus-ring min-w-0 flex-1 text-left outline-none"
              >
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      "block min-w-0 flex-1 truncate text-sm font-medium",
                      isCompleted ? "text-text-muted line-through" : "text-text",
                    )}
                  >
                    {task.title || "Untitled"}
                  </span>

                  {(hasLink || hasDescription || hasWaitingFor || hasRecurrence) && (
                    <span className="flex shrink-0 items-center gap-1 text-text-muted/40">
                      {hasRecurrence ? (
                        <Repeat2
                          className="h-3.5 w-3.5 stroke-[1.8]"
                          data-testid="task-row-recurrence-indicator"
                        />
                      ) : null}
                      {hasWaitingFor ? (
                        <span title={`Waiting: ${task.waitingFor}`}>
                          <Clock3
                            className="h-3.5 w-3.5 stroke-[1.8]"
                            data-testid="task-row-waiting-indicator"
                          />
                        </span>
                      ) : null}
                      {hasLink ? (
                        <Link2
                          className="h-3.5 w-3.5 stroke-[1.8]"
                          data-testid="task-row-link-indicator"
                        />
                      ) : null}
                      {hasDescription ? (
                        <FileText
                          className="h-3.5 w-3.5 stroke-[1.8]"
                          data-testid="task-row-description-indicator"
                        />
                      ) : null}
                    </span>
                  )}
                </span>

                {(secondaryLabel || dueDateLabel) && (
                  <span
                    className={cn(
                      "mt-0.5 flex min-w-0 items-center gap-1.5 overflow-hidden text-xs leading-none tabular-nums",
                      overdue && secondaryLabel ? "text-[var(--color-danger)]" : "text-text-muted/60",
                    )}
                  >
                    {secondaryLabel && (
                      isCompletedViewItem ? (
                        <span className="inline-flex min-w-0 items-center gap-1">
                          <CheckCheck className="h-3.25 w-3.25 shrink-0 stroke-[1.9]" />
                          <span>{secondaryLabel}</span>
                        </span>
                      ) : (
                        <span className="inline-flex min-w-0 items-center gap-1">
                          <CalendarDays className="h-3.25 w-3.25 shrink-0 stroke-[1.9]" />
                          <span>{secondaryLabel}</span>
                        </span>
                      )
                    )}
                    {secondaryLabel && dueDateLabel && (
                      <span className="text-text-muted/30">·</span>
                    )}
                    {dueDateLabel && (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1",
                          dueOverdue ? "text-[var(--color-danger)]" : "text-text-muted/60",
                        )}
                      >
                        <Flag className="h-3 w-3 shrink-0 stroke-[1.9]" />
                        <span>{dueDateLabel}</span>
                      </span>
                    )}
                  </span>
                )}
              </button>
            )}

            <button
              type="button"
              aria-label={task.starred ? "Unstar task" : "Star task"}
              onClick={(event) => {
                event.stopPropagation();
                onToggleStar();
              }}
              className={cn(
                "mt-0.5 shrink-0 rounded transition-colors outline-none",
                "focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-1",
                task.starred
                  ? "text-amber-400"
                  : "text-transparent group-hover:text-text-muted/30 hover:!text-text-muted",
              )}
            >
              <Star
                className="h-3.5 w-3.5"
                fill={task.starred ? "currentColor" : "none"}
                strokeWidth={task.starred ? 0 : 1.8}
              />
            </button>
          </div>
        </div>
      </ContextMenu.Trigger>
      {contextMenu ? (
        <ContextMenu.Portal>
          <ContextMenu.Content className={`${menuSurfaceClassName} min-w-44 z-50`}>
            {contextMenu}
          </ContextMenu.Content>
        </ContextMenu.Portal>
      ) : null}
    </ContextMenu.Root>
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
  return `${names[m - 1]} ${d}, ${y}`;
}

function offsetDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

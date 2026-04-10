import type { Task, TaskMetadata, TaskView } from "../types/tasks";

export const TASK_VIEW_LABELS: Record<TaskView, string> = {
  inbox: "Inbox",
  today: "Today",
  upcoming: "Upcoming",
  completed: "Completed",
};

export const TASK_VIEW_ORDER: TaskView[] = [
  "inbox",
  "today",
  "upcoming",
  "completed",
];

/**
 * Derive which horizon view a task belongs to.
 * Priority (first match wins):
 *  1. completed_at set           → completed
 *  2. action_at local-date <= today → today (includes overdue)
 *  3. action_at local-date > today  → upcoming
 *  4. no action_at               → inbox
 */
export function deriveView(task: Pick<TaskMetadata, 'completedAt' | 'actionAt'>, today: string): TaskView {
  if (task.completedAt) return "completed";
  const actionDate = actionAtToLocalDate(task.actionAt);
  if (actionDate) {
    return actionDate <= today ? "today" : "upcoming";
  }
  return "inbox";
}

/** True if the task is overdue (action_at in the past, not completed). */
export function isOverdue(task: Pick<TaskMetadata, 'completedAt' | 'actionAt'>, today: string): boolean {
  const actionDate = actionAtToLocalDate(task.actionAt);
  if (task.completedAt || !actionDate) return false;
  return actionDate < today;
}

/** Group a flat task list into per-view buckets. */
export function groupByView(
  tasks: TaskMetadata[],
  today: string
): Record<TaskView, TaskMetadata[]> {
  const buckets: Record<TaskView, TaskMetadata[]> = {
    inbox: [],
    today: [],
    upcoming: [],
    completed: [],
  };

  for (const task of tasks) {
    const view = deriveView(task, today);
    buckets[view].push(task);
  }

  return buckets;
}

/**
 * Compare two tasks for display ordering within a view.
 * Within Today/Upcoming: sort by action_at ASC, then created_at ASC.
 * All other views: sort by created_at ASC (most recently created last = natural append order).
 */
export function compareTasks(a: TaskMetadata, b: TaskMetadata, view: TaskView): number {
  if (view === "today" || view === "upcoming") {
    const aDate = actionAtToLocalDate(a.actionAt);
    const bDate = actionAtToLocalDate(b.actionAt);
    if (aDate && bDate) {
      const dateCmp = aDate.localeCompare(bDate);
      if (dateCmp !== 0) return dateCmp;
      const timeCmp = (a.actionAt ?? "").localeCompare(b.actionAt ?? "");
      if (timeCmp !== 0) return timeCmp;
    } else if (aDate) {
      return -1;
    } else if (bDate) {
      return 1;
    }
  }
  if (view === "completed") {
    const aTs = a.completedAt ?? "";
    const bTs = b.completedAt ?? "";
    return bTs.localeCompare(aTs);
  }
  // Default: most recently created last (natural capture order).
  return a.createdAt.localeCompare(b.createdAt);
}

/** Today's date as a YYYY-MM-DD string in local time. */
export function localDateString(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function actionAtToLocalDate(actionAt: string | null): string | null {
  if (!actionAt) return null;

  const date = new Date(actionAt);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return localDateString(date);
}

export function localDateToNormalizedActionAt(date: string | null): string | null {
  if (!date) return null;

  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }

  const localNoon = new Date(year, month - 1, day, 12, 0, 0, 0);
  return localNoon.toISOString();
}

export function activeCountForView(
  buckets: Record<TaskView, TaskMetadata[]>,
  view: TaskView
): number {
  return buckets[view].length;
}

export function taskIsFullTask(task: TaskMetadata | Task): task is Task {
  return "description" in task;
}

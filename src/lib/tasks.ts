import type { Task, TaskMetadata, TaskView } from "../types/tasks";

export const TASK_VIEW_LABELS: Record<TaskView, string> = {
  inbox: "Inbox",
  today: "Today",
  upcoming: "Upcoming",
  someday: "Someday",
  waiting: "Waiting",
  logbook: "Logbook",
};

export const TASK_VIEW_ORDER: TaskView[] = [
  "inbox",
  "today",
  "upcoming",
  "someday",
  "waiting",
  "logbook",
];

/**
 * Derive which horizon view a task belongs to.
 * Priority (first match wins):
 *  1. completed_at set           → logbook
 *  2. waiting                    → waiting
 *  3. someday                    → someday
 *  4. action_at <= today         → today  (includes overdue)
 *  5. action_at > today          → upcoming
 *  6. (no date, no flags)        → inbox
 */
export function deriveView(task: Pick<TaskMetadata, 'completedAt' | 'waiting' | 'someday' | 'actionAt'>, today: string): TaskView {
  if (task.completedAt) return "logbook";
  if (task.waiting) return "waiting";
  if (task.someday) return "someday";
  if (task.actionAt) {
    return task.actionAt <= today ? "today" : "upcoming";
  }
  return "inbox";
}

/** True if the task is overdue (action_at in the past, not completed). */
export function isOverdue(task: Pick<TaskMetadata, 'completedAt' | 'actionAt'>, today: string): boolean {
  if (task.completedAt || !task.actionAt) return false;
  return task.actionAt < today;
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
    someday: [],
    waiting: [],
    logbook: [],
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
    if (a.actionAt && b.actionAt) {
      const dateCmp = a.actionAt.localeCompare(b.actionAt);
      if (dateCmp !== 0) return dateCmp;
    } else if (a.actionAt) {
      return -1;
    } else if (b.actionAt) {
      return 1;
    }
  }
  // Logbook: most recently completed first.
  if (view === "logbook") {
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

/** Count of non-logbook, non-completed tasks in a bucket set. */
export function activeCountForView(
  buckets: Record<TaskView, TaskMetadata[]>,
  view: TaskView
): number {
  return buckets[view].length;
}

export function taskIsFullTask(task: TaskMetadata | Task): task is Task {
  return "notes" in task;
}

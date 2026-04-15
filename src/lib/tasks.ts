import * as chrono from "chrono-node";
import type { ParsedResult, Parser } from "chrono-node";
import type {
  Task,
  TaskMetadata,
  TaskScheduleBucket,
  TaskSortMode,
  TaskView,
} from "../types/tasks";

// Extend the casual parser with short aliases: "tod" → today, "tom" → tomorrow.
// These complement the built-in "tmr"/"tmrw" aliases already handled by chrono.
const shortAliasParser: Parser = {
  pattern: () => /\b(tod|tom)\b/i,
  extract: (context, match) => {
    const word = match[1].toLowerCase();
    const target = new Date(context.refDate);
    if (word === "tom") target.setDate(target.getDate() + 1);
    return {
      year: target.getFullYear(),
      month: target.getMonth() + 1,
      day: target.getDate(),
    };
  },
};

const casualWithAliases = chrono.casual.clone();
casualWithAliases.parsers.unshift(shortAliasParser);

export const TASK_VIEW_LABELS: Record<TaskView, string> = {
  inbox: "Inbox",
  today: "Today",
  upcoming: "Upcoming",
  waiting: "Waiting",
  anytime: "Anytime",
  someday: "Someday",
  completed: "Completed",
  starred: "Starred",
};

export const TASK_SCHEDULE_BUCKET_LABELS: Record<TaskScheduleBucket, string> = {
  anytime: "Anytime",
  someday: "Someday",
};

export const TASK_VIEW_ORDER: TaskView[] = [
  "inbox",
  "today",
  "upcoming",
  "anytime",
  "someday",
  "completed",
  "starred",
  "waiting",
];

/** Views that support manual drag-to-reorder sort. */
export const MANUAL_SORT_VIEWS: TaskView[] = ["inbox", "today", "anytime", "someday"];

export const TASK_DRAG_TARGET_VIEWS: TaskView[] = [
  "inbox",
  "today",
  "anytime",
  "someday",
  "completed",
];

export interface DetectedTaskDate {
  actionAt: string;
  cleanedTitle: string;
  label: string;
  localDate: string;
  matchedText: string;
  signature: string;
}

export interface DetectedTaskUrl {
  cleanedTitle: string;
  matchedText: string;
  signature: string;
  url: string;
}

/**
 * Derive which primary horizon view a task belongs to.
 * Priority (first match wins):
 *  1. completed_at set              → completed
 *  2. action_at local-date <= today → today (includes overdue)
 *  3. action_at local-date > today  → upcoming
 *  4. schedule_bucket = anytime     → anytime
 *  5. schedule_bucket = someday     → someday
 *  6. otherwise                     → inbox
 *
 * Waiting is intentionally separate from the primary-horizon derivation.
 * Waiting tasks keep their underlying horizon and are added to a dedicated
 * waiting bucket in `groupByView`.
 */
export function deriveView(
  task: Pick<TaskMetadata, "completedAt" | "actionAt" | "scheduleBucket">,
  today: string,
): TaskView {
  if (task.completedAt) return "completed";
  const actionDate = actionAtToLocalDate(task.actionAt);
  if (actionDate) {
    return actionDate <= today ? "today" : "upcoming";
  }
  if (task.scheduleBucket === "anytime") return "anytime";
  if (task.scheduleBucket === "someday") return "someday";
  return "inbox";
}

/** True if the task is overdue (action_at in the past, not completed). */
export function isOverdue(
  task: Pick<TaskMetadata, "completedAt" | "actionAt">,
  today: string,
): boolean {
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
    waiting: [],
    anytime: [],
    someday: [],
    completed: [],
    starred: [],
  };

  for (const task of tasks) {
    const view = deriveView(task, today);
    buckets[view].push(task);
    if (!task.completedAt && task.waitingFor.trim()) {
      buckets.waiting.push(task);
    }
    if (task.starred && !task.completedAt) {
      buckets.starred.push(task);
    }
  }

  return buckets;
}

/**
 * Returns true if the task matches the given search query.
 * Searches title, description, link, and waitingFor (case-insensitive contains).
 */
export function taskMatchesQuery(task: TaskMetadata, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [task.title, task.description, task.link, task.waitingFor].some(
    (field) => field.toLowerCase().includes(needle),
  );
}

export function getDefaultTaskSortMode(view: TaskView): TaskSortMode {
  switch (view) {
    case "today":
    case "upcoming":
    case "waiting":
      return "actionAsc";
    case "completed":
      return "completedDesc";
    default:
      return "createdAsc";
  }
}

/**
 * Compare two tasks for display ordering within a view.
 * Starred tasks float first in all modes except "manual".
 * In "manual" mode tasks are ordered by their position in viewOrder (if provided),
 * falling back to createdAt ascending.
 */
export function compareTasks(
  a: TaskMetadata,
  b: TaskMetadata,
  view: TaskView,
  sortMode?: TaskSortMode,
  viewOrder?: string[],
): number {
  const mode = sortMode ?? getDefaultTaskSortMode(view);

  if (mode === "manual") {
    if (viewOrder) {
      const aIdx = viewOrder.indexOf(a.id);
      const bIdx = viewOrder.indexOf(b.id);
      const aPos = aIdx === -1 ? Infinity : aIdx;
      const bPos = bIdx === -1 ? Infinity : bIdx;
      if (aPos !== bPos) return aPos < bPos ? -1 : 1;
    }
    return a.createdAt.localeCompare(b.createdAt);
  }

  // Stars always float first in all non-manual modes
  if (a.starred !== b.starred) return a.starred ? -1 : 1;

  switch (mode) {
    case "actionAsc":
    case "actionDesc": {
      const dir = mode === "actionAsc" ? 1 : -1;
      const aDate = actionAtToLocalDate(a.actionAt);
      const bDate = actionAtToLocalDate(b.actionAt);
      if (aDate && bDate) {
        const dateCmp = aDate.localeCompare(bDate);
        if (dateCmp !== 0) return dateCmp * dir;
        const timeCmp = (a.actionAt ?? "").localeCompare(b.actionAt ?? "");
        if (timeCmp !== 0) return timeCmp * dir;
      } else if (aDate) {
        return -1;
      } else if (bDate) {
        return 1;
      }
      // Waiting: secondary bucket sort when dates are equal/absent
      if (view === "waiting") {
        const bucketCmp =
          scheduleBucketSortOrder(a.scheduleBucket) -
          scheduleBucketSortOrder(b.scheduleBucket);
        if (bucketCmp !== 0) return bucketCmp;
      }
      return a.createdAt.localeCompare(b.createdAt);
    }
    case "createdAsc":
      return a.createdAt.localeCompare(b.createdAt);
    case "createdDesc":
      return b.createdAt.localeCompare(a.createdAt);
    case "titleAsc":
      return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
    case "titleDesc":
      return b.title.localeCompare(a.title, undefined, { sensitivity: "base" });
    case "completedAsc":
      return (a.completedAt ?? "").localeCompare(b.completedAt ?? "");
    case "completedDesc":
      return (b.completedAt ?? "").localeCompare(a.completedAt ?? "");
    default:
      return a.createdAt.localeCompare(b.createdAt);
  }
}

function scheduleBucketSortOrder(bucket: TaskScheduleBucket | null): number {
  if (bucket === "anytime") return 0;
  if (bucket === "someday") return 1;
  return 2;
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

export function formatTaskDate(date: string, today: string): string {
  if (!date) return "";
  if (date === today) return "Today";
  const tomorrow = offsetLocalDate(today, 1);
  if (date === tomorrow) return "Tomorrow";
  const [y, m, d] = date.split("-").map(Number);
  const todayYear = Number(today.split("-")[0]);
  const month = new Date(y, m - 1, d).toLocaleString("en-US", { month: "short" });
  return `${month} ${d}${y !== todayYear ? `, ${y}` : ""}`;
}

export function taskScheduleSelectionFromView(
  view: TaskView,
  today: string,
): { actionAt: string | null; scheduleBucket: TaskScheduleBucket | null } | null {
  if (view === "today") {
    return {
      actionAt: localDateToNormalizedActionAt(today),
      scheduleBucket: null,
    };
  }

  if (view === "anytime" || view === "someday") {
    return {
      actionAt: null,
      scheduleBucket: view,
    };
  }

  return null;
}

export function detectTaskDateFromTitle(title: string, today: string): DetectedTaskDate | null {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) return null;

  const referenceDate = localDateToReference(today);
  const matches = casualWithAliases.parse(trimmedTitle, referenceDate, { forwardDate: true });

  for (const match of matches) {
    const localDate = localDateString(match.start.date());
    const cleanedTitle = stripMatchedDateText(trimmedTitle, match);
    const actionAt = localDateToNormalizedActionAt(localDate);

    if (!cleanedTitle || !actionAt) {
      continue;
    }

    return {
      actionAt,
      cleanedTitle,
      label: formatTaskDate(localDate, today),
      localDate,
      matchedText: match.text,
      signature: `${match.index}:${match.text.toLowerCase()}:${localDate}:${cleanedTitle.toLowerCase()}`,
    };
  }

  return null;
}

export function detectTaskUrlFromTitle(title: string): DetectedTaskUrl | null {
  const trimmed = title.trim();
  if (!trimmed) return null;

  const urlRegex = /https?:\/\/\S+/g;
  const match = urlRegex.exec(trimmed);
  if (!match) return null;

  // Trim trailing punctuation that is unlikely to be part of the URL.
  const matchedText = match[0].replace(/[.,;:!?)\]}>]+$/, "");
  if (!matchedText) return null;

  const before = trimmed.slice(0, match.index).trimEnd();
  const after = trimmed.slice(match.index + matchedText.length).trimStart();

  let cleanedTitle = before && after ? `${before} ${after}` : before || after;
  cleanedTitle = cleanedTitle
    .replace(/\s{2,}/g, " ")
    .replace(/\s*[-,:|]\s*$/g, "")
    .replace(/^\s*[-,:|]\s*/g, "")
    .trim();

  if (!cleanedTitle) return null;

  return {
    cleanedTitle,
    matchedText,
    signature: `url:${matchedText.toLowerCase()}:${cleanedTitle.toLowerCase()}`,
    url: matchedText,
  };
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

function localDateToReference(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) {
    return new Date();
  }

  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function offsetLocalDate(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const nextDate = new Date(year, month - 1, day);
  nextDate.setDate(nextDate.getDate() + days);
  return localDateString(nextDate);
}

function stripMatchedDateText(title: string, match: ParsedResult): string {
  const before = title.slice(0, match.index).trimEnd();
  const after = title.slice(match.index + match.text.length).trimStart();

  let merged = before && after ? `${before} ${after}` : before || after;
  merged = merged
    .replace(/\(\s*\)|\[\s*\]|\{\s*\}/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s*[-,:|]\s*$/g, "")
    .replace(/^\s*[-,:|]\s*/g, "")
    .trim();

  return merged;
}

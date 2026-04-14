import { describe, expect, it } from "vitest";
import type { TaskMetadata } from "../types/tasks";
import { compareTasks, deriveView, detectTaskDateFromTitle, groupByView, isOverdue, localDateString, taskMatchesQuery } from "./tasks";

const TODAY = "2026-04-09";

function meta(
  overrides: Partial<TaskMetadata> = {}
): TaskMetadata {
  return {
    id: "test",
    title: "Test Task",
    description: "",
    link: "",
    waitingFor: "",
    createdAt: "2026-04-09T10:00:00Z",
    actionAt: null,
    scheduleBucket: null,
    completedAt: null,
    starred: false,
    dueAt: null,
    recurrence: null,
    ...overrides,
  };
}

describe("deriveView", () => {
  it.each([
    ["completed", meta({ completedAt: "2026-04-09T12:00:00Z" })],
    ["today",     meta({ actionAt: "2026-04-09T18:00:00Z" })],
    ["today",     meta({ actionAt: "2026-04-08T18:00:00Z" })],
    ["upcoming",  meta({ actionAt: "2026-04-10T18:00:00Z" })],
    ["anytime",   meta({ scheduleBucket: "anytime" })],
    ["someday",   meta({ scheduleBucket: "someday" })],
    ["inbox",     meta()],
  ] as [string, TaskMetadata][])(
    "→ %s",
    (expected, task) => {
      expect(deriveView(task, TODAY)).toBe(expected);
    }
  );
});

describe("isOverdue", () => {
  it("returns true for past action_at not completed", () => {
    expect(isOverdue(meta({ actionAt: "2026-04-08T18:00:00Z" }), TODAY)).toBe(true);
  });

  it("returns false for today", () => {
    expect(isOverdue(meta({ actionAt: "2026-04-09T18:00:00Z" }), TODAY)).toBe(false);
  });

  it("returns false when completed", () => {
    expect(isOverdue(meta({ actionAt: "2026-04-08T18:00:00Z", completedAt: "2026-04-09T10:00:00Z" }), TODAY)).toBe(false);
  });

  it("returns false with no action_at", () => {
    expect(isOverdue(meta(), TODAY)).toBe(false);
  });
});

describe("groupByView", () => {
  it("puts each task in the right bucket", () => {
    const tasks: TaskMetadata[] = [
      meta({ id: "1" }),
      meta({ id: "2", actionAt: "2026-04-09T18:00:00Z" }),
      meta({ id: "3", actionAt: "2026-04-10T18:00:00Z" }),
      meta({ id: "4", scheduleBucket: "anytime" }),
      meta({ id: "5", scheduleBucket: "someday" }),
      meta({ id: "6", completedAt: "2026-04-09T10:00:00Z" }),
    ];
    const buckets = groupByView(tasks, TODAY);
    expect(buckets.inbox.map(t => t.id)).toEqual(["1"]);
    expect(buckets.today.map(t => t.id)).toEqual(["2"]);
    expect(buckets.upcoming.map(t => t.id)).toEqual(["3"]);
    expect(buckets.waiting.map(t => t.id)).toEqual([]);
    expect(buckets.anytime.map(t => t.id)).toEqual(["4"]);
    expect(buckets.someday.map(t => t.id)).toEqual(["5"]);
    expect(buckets.completed.map(t => t.id)).toEqual(["6"]);
  });

  it("adds waiting tasks to the waiting bucket without removing them from their horizon", () => {
    const tasks: TaskMetadata[] = [
      meta({ id: "1", waitingFor: "Jordan" }),
      meta({ id: "2", waitingFor: "Jordan", actionAt: "2026-04-10T18:00:00Z" }),
      meta({ id: "3", waitingFor: "Jordan", scheduleBucket: "anytime" }),
      meta({ id: "4", waitingFor: "Jordan", completedAt: "2026-04-09T10:00:00Z" }),
    ];

    const buckets = groupByView(tasks, TODAY);
    expect(buckets.inbox.map((task) => task.id)).toEqual(["1"]);
    expect(buckets.upcoming.map((task) => task.id)).toEqual(["2"]);
    expect(buckets.anytime.map((task) => task.id)).toEqual(["3"]);
    expect(buckets.completed.map((task) => task.id)).toEqual(["4"]);
    expect(buckets.waiting.map((task) => task.id)).toEqual(["1", "2", "3"]);
  });
});

describe("compareTasks", () => {
  it("sorts upcoming by action_at ASC", () => {
    const a = meta({ id: "a", actionAt: "2026-04-10T18:00:00Z" });
    const b = meta({ id: "b", actionAt: "2026-04-12T18:00:00Z" });
    expect(compareTasks(a, b, "upcoming")).toBeLessThan(0);
    expect(compareTasks(b, a, "upcoming")).toBeGreaterThan(0);
  });

  it("sorts completed by completedAt DESC (most recent first)", () => {
    const a = meta({ id: "a", completedAt: "2026-04-09T10:00:00Z" });
    const b = meta({ id: "b", completedAt: "2026-04-08T10:00:00Z" });
    expect(compareTasks(a, b, "completed")).toBeLessThan(0);
  });

  it("sorts inbox by createdAt ASC", () => {
    const a = meta({ id: "a", createdAt: "2026-04-09T08:00:00Z" });
    const b = meta({ id: "b", createdAt: "2026-04-09T09:00:00Z" });
    expect(compareTasks(a, b, "inbox")).toBeLessThan(0);
  });

  it("sorts waiting by action date before unscheduled waiting items", () => {
    const dated = meta({ id: "dated", waitingFor: "Jordan", actionAt: "2026-04-10T18:00:00Z" });
    const unscheduled = meta({ id: "unscheduled", waitingFor: "Jordan" });
    expect(compareTasks(dated, unscheduled, "waiting")).toBeLessThan(0);
  });
});

describe("localDateString", () => {
  it("formats a known date correctly", () => {
    const d = new Date(2026, 3, 9); // April 9 2026 (month is 0-indexed)
    expect(localDateString(d)).toBe("2026-04-09");
  });
});

describe("detectTaskDateFromTitle", () => {
  it("detects 'tod' as today", () => {
    const result = detectTaskDateFromTitle("Call dentist tod", TODAY);
    expect(result?.localDate).toBe(TODAY);
    expect(result?.cleanedTitle).toBe("Call dentist");
  });

  it("detects 'tom' as tomorrow", () => {
    const result = detectTaskDateFromTitle("Submit report tom", TODAY);
    expect(result?.localDate).toBe("2026-04-10");
    expect(result?.cleanedTitle).toBe("Submit report");
  });

  it("does not match 'tod' inside a longer word", () => {
    const result = detectTaskDateFromTitle("Today is a good today", TODAY);
    // 'today' is a full word and should still parse (built-in), not the alias
    expect(result?.localDate).toBe(TODAY);
  });

  it("does not match 'tom' inside a longer word like 'tomorrow'", () => {
    const result = detectTaskDateFromTitle("Do it tomorrow", TODAY);
    expect(result?.localDate).toBe("2026-04-10");
    expect(result?.matchedText).toBe("tomorrow");
  });
});

describe("taskMatchesQuery", () => {
  it("matches title (case-insensitive)", () => {
    expect(taskMatchesQuery(meta({ title: "Deploy hotfix" }), "hotfix")).toBe(true);
    expect(taskMatchesQuery(meta({ title: "Deploy hotfix" }), "HOTFIX")).toBe(true);
  });

  it("matches description", () => {
    expect(taskMatchesQuery(meta({ description: "Check the logs first" }), "logs")).toBe(true);
  });

  it("matches link", () => {
    expect(taskMatchesQuery(meta({ link: "https://github.com/org/repo" }), "github")).toBe(true);
  });

  it("matches waitingFor", () => {
    expect(taskMatchesQuery(meta({ waitingFor: "Jordan" }), "jordan")).toBe(true);
  });

  it("returns false when no field matches", () => {
    expect(taskMatchesQuery(meta({ title: "Write tests" }), "deploy")).toBe(false);
  });

  it("returns true for an empty query", () => {
    expect(taskMatchesQuery(meta(), "")).toBe(true);
    expect(taskMatchesQuery(meta(), "   ")).toBe(true);
  });
});

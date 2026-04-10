import { describe, expect, it } from "vitest";
import type { TaskMetadata } from "../types/tasks";
import { compareTasks, deriveView, groupByView, isOverdue, localDateString } from "./tasks";

const TODAY = "2026-04-09";

function meta(
  overrides: Partial<TaskMetadata> = {}
): TaskMetadata {
  return {
    id: "test",
    title: "Test Task",
    createdAt: "2026-04-09T10:00:00Z",
    actionAt: null,
    completedAt: null,
    ...overrides,
  };
}

describe("deriveView", () => {
  it.each([
    ["completed", meta({ completedAt: "2026-04-09T12:00:00Z" })],
    ["today",     meta({ actionAt: "2026-04-09T18:00:00Z" })],
    ["today",     meta({ actionAt: "2026-04-08T18:00:00Z" })],
    ["upcoming",  meta({ actionAt: "2026-04-10T18:00:00Z" })],
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
      meta({ id: "4", completedAt: "2026-04-09T10:00:00Z" }),
    ];
    const buckets = groupByView(tasks, TODAY);
    expect(buckets.inbox.map(t => t.id)).toEqual(["1"]);
    expect(buckets.today.map(t => t.id)).toEqual(["2"]);
    expect(buckets.upcoming.map(t => t.id)).toEqual(["3"]);
    expect(buckets.completed.map(t => t.id)).toEqual(["4"]);
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
});

describe("localDateString", () => {
  it("formats a known date correctly", () => {
    const d = new Date(2026, 3, 9); // April 9 2026 (month is 0-indexed)
    expect(localDateString(d)).toBe("2026-04-09");
  });
});

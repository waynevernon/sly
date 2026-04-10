import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TaskRow } from "./TaskRow";
import type { TaskMetadata } from "../../types/tasks";

function makeTask(overrides: Partial<TaskMetadata> = {}): TaskMetadata {
  return {
    id: "task-1",
    title: "Plan launch",
    description: "",
    link: "",
    waitingFor: "",
    createdAt: "2026-04-10T12:00:00Z",
    actionAt: null,
    scheduleBucket: null,
    completedAt: null,
    ...overrides,
  };
}

describe("TaskRow", () => {
  it("shows subtle indicators for link and description presence", () => {
    render(
      <TaskRow
        task={makeTask({
          description: "Write rollout notes",
          link: "https://example.com",
        })}
        view="inbox"
        today="2026-04-10"
        isSelected={false}
        onSelect={vi.fn()}
        onToggleComplete={vi.fn()}
      />,
    );

    expect(screen.getByTestId("task-row-link-indicator")).toBeInTheDocument();
    expect(screen.getByTestId("task-row-description-indicator")).toBeInTheDocument();
  });

  it("shows a waiting indicator when the task is blocked on someone or something", () => {
    render(
      <TaskRow
        task={makeTask({ waitingFor: "Jordan" })}
        view="inbox"
        today="2026-04-10"
        isSelected={false}
        onSelect={vi.fn()}
        onToggleComplete={vi.fn()}
      />,
    );

    expect(screen.getByTestId("task-row-waiting-indicator")).toBeInTheDocument();
  });

  it("hides indicators when neither link nor description is present", () => {
    render(
      <TaskRow
        task={makeTask()}
        view="inbox"
        today="2026-04-10"
        isSelected={false}
        onSelect={vi.fn()}
        onToggleComplete={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("task-row-link-indicator")).toBeNull();
    expect(screen.queryByTestId("task-row-description-indicator")).toBeNull();
  });
});

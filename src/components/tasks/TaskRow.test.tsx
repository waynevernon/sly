import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TaskRow } from "./TaskRow";
import type { TaskMetadata } from "../../types/tasks";

vi.mock("@dnd-kit/core", () => ({
  useDraggable: vi.fn(() => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    isDragging: false,
  })),
}));

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
    starred: false,
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
        dragIds={["task-1"]}
        view="inbox"
        today="2026-04-10"
        selectionState="none"
        onSelect={vi.fn()}
        onContextMenuOpen={vi.fn()}
        onToggleComplete={vi.fn()}
        onToggleStar={vi.fn()}
      />,
    );

    expect(screen.getByTestId("task-row-link-indicator")).toBeInTheDocument();
    expect(screen.getByTestId("task-row-description-indicator")).toBeInTheDocument();
  });

  it("shows a waiting indicator when the task is blocked on someone or something", () => {
    render(
      <TaskRow
        task={makeTask({ waitingFor: "Jordan" })}
        dragIds={["task-1"]}
        view="inbox"
        today="2026-04-10"
        selectionState="none"
        onSelect={vi.fn()}
        onContextMenuOpen={vi.fn()}
        onToggleComplete={vi.fn()}
        onToggleStar={vi.fn()}
      />,
    );

    expect(screen.getByTestId("task-row-waiting-indicator")).toBeInTheDocument();
  });

  it("hides indicators when neither link nor description is present", () => {
    render(
      <TaskRow
        task={makeTask()}
        dragIds={["task-1"]}
        view="inbox"
        today="2026-04-10"
        selectionState="none"
        onSelect={vi.fn()}
        onContextMenuOpen={vi.fn()}
        onToggleComplete={vi.fn()}
        onToggleStar={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("task-row-link-indicator")).toBeNull();
    expect(screen.queryByTestId("task-row-description-indicator")).toBeNull();
  });

  it("selects the task when clicking the row body, not just the title text", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <TaskRow
        task={makeTask()}
        dragIds={["task-1"]}
        view="inbox"
        today="2026-04-10"
        selectionState="none"
        onSelect={onSelect}
        onContextMenuOpen={vi.fn()}
        onToggleComplete={vi.fn()}
        onToggleStar={vi.fn()}
      />,
    );

    const rowBody = screen.getByRole("option").firstElementChild as HTMLElement;
    await user.click(rowBody);

    expect(onSelect).toHaveBeenCalledWith({
      shiftKey: false,
      metaKey: false,
      ctrlKey: false,
    });
  });
});

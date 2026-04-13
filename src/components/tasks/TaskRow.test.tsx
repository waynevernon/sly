import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TaskRow } from "./TaskRow";
import type { TaskMetadata } from "../../types/tasks";

vi.mock("@dnd-kit/sortable", () => ({
  useSortable: vi.fn(() => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    isDragging: false,
    transform: null,
    transition: undefined,
  })),
}));

vi.mock("@dnd-kit/utilities", () => ({
  CSS: { Transform: { toString: vi.fn(() => undefined) } },
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

function renderRow(props: Partial<Parameters<typeof TaskRow>[0]> = {}) {
  return render(
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
      onRename={vi.fn()}
      {...props}
    />,
  );
}

describe("TaskRow", () => {
  it("shows subtle indicators for link and description presence", () => {
    renderRow({
      task: makeTask({
        description: "Write rollout notes",
        link: "https://example.com",
      }),
    });

    expect(screen.getByTestId("task-row-link-indicator")).toBeInTheDocument();
    expect(screen.getByTestId("task-row-description-indicator")).toBeInTheDocument();
  });

  it("shows a waiting indicator when the task is blocked on someone or something", () => {
    renderRow({ task: makeTask({ waitingFor: "Jordan" }) });

    expect(screen.getByTestId("task-row-waiting-indicator")).toBeInTheDocument();
  });

  it("hides indicators when neither link nor description is present", () => {
    renderRow();

    expect(screen.queryByTestId("task-row-link-indicator")).toBeNull();
    expect(screen.queryByTestId("task-row-description-indicator")).toBeNull();
  });

  it("selects the task when clicking the row body, not just the title text", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    renderRow({ onSelect });

    const rowBody = screen.getByRole("option").firstElementChild as HTMLElement;
    await user.click(rowBody);

    expect(onSelect).toHaveBeenCalledWith({
      shiftKey: false,
      metaKey: false,
      ctrlKey: false,
    });
  });

  it("enters edit mode on double-click and commits on Enter", async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();

    renderRow({ onRename });

    await user.dblClick(screen.getByRole("button", { name: "Plan launch" }));
    const input = screen.getByRole("textbox");
    expect(input).toBeInTheDocument();

    await user.clear(input);
    await user.type(input, "Updated title");
    await user.keyboard("{Enter}");

    expect(onRename).toHaveBeenCalledWith("Updated title");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("cancels the rename on Escape and does not call onRename", async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();

    renderRow({ onRename });

    await user.dblClick(screen.getByRole("button", { name: "Plan launch" }));
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "Abandoned edit");
    await user.keyboard("{Escape}");

    expect(onRename).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("does not call onRename when committed value is unchanged", async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();

    renderRow({ onRename });

    await user.dblClick(screen.getByRole("button", { name: "Plan launch" }));
    // Don't change anything — just press Enter
    await user.keyboard("{Enter}");

    expect(onRename).not.toHaveBeenCalled();
  });

  it("does not call onRename when committed value is blank", async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();

    renderRow({ onRename });

    await user.dblClick(screen.getByRole("button", { name: "Plan launch" }));
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.keyboard("{Enter}");

    expect(onRename).not.toHaveBeenCalled();
  });
});

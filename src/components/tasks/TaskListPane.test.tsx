import userEvent from "@testing-library/user-event";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "../ui";
import { TaskListPane } from "./TaskListPane";

vi.mock("../../context/TasksContext", () => ({
  useTasks: vi.fn(),
}));

vi.mock("./TaskRow", () => ({
  TaskRow: () => <div data-testid="task-row" />,
}));

type TasksHookValue = ReturnType<
  typeof import("../../context/TasksContext").useTasks
>;

function makeTasksHookValue(
  overrides: Partial<TasksHookValue> = {},
): TasksHookValue {
  return {
    buckets: {
      inbox: [],
      today: [],
      upcoming: [],
      someday: [],
      waiting: [],
      logbook: [],
    },
    selectedView: "inbox",
    selectedTaskId: null,
    today: "2026-04-09",
    isLoading: false,
    selectTask: vi.fn(),
    setCompleted: vi.fn(),
    createTask: vi.fn().mockResolvedValue({
      id: "task-1",
      title: "Draft task",
      createdAt: "2026-04-09T10:00:00Z",
      actionAt: null,
      waiting: false,
      someday: false,
      completedAt: null,
      notes: "",
    }),
    ...overrides,
  } as never;
}

describe("TaskListPane", () => {
  beforeEach(async () => {
    const tasksContext = await import("../../context/TasksContext");
    vi.mocked(tasksContext.useTasks).mockReturnValue(makeTasksHookValue());
  });

  it("keeps inline capture open after pressing Enter so another task can be added", async () => {
    const user = userEvent.setup();
    const tasksContext = await import("../../context/TasksContext");
    const createTask = vi.fn().mockResolvedValue({
      id: "task-1",
      title: "First task",
      createdAt: "2026-04-09T10:00:00Z",
      actionAt: null,
      waiting: false,
      someday: false,
      completedAt: null,
      notes: "",
    });
    const selectTask = vi.fn();

    vi.mocked(tasksContext.useTasks).mockReturnValue(
      makeTasksHookValue({ createTask, selectTask }),
    );

    render(
      <TooltipProvider>
        <TaskListPane />
      </TooltipProvider>,
    );

    await user.click(screen.getAllByRole("button", { name: "New Task" })[0]);

    const input = screen.getByPlaceholderText("Task name");
    await user.type(input, "First task{enter}");

    await waitFor(() => {
      expect(createTask).toHaveBeenCalledWith("First task");
    });

    const refreshedInput = screen.getByPlaceholderText("Task name");
    expect(refreshedInput).toHaveValue("");
    expect(refreshedInput).toHaveFocus();
    expect(selectTask).not.toHaveBeenCalled();
  });
});

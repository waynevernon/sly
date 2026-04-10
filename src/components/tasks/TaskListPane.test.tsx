import userEvent from "@testing-library/user-event";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localDateToNormalizedActionAt } from "../../lib/tasks";
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
      completed: [],
    },
    selectedView: "inbox",
    selectedTaskId: null,
    today: "2026-04-09",
    isLoading: false,
    selectTask: vi.fn(),
    setCompleted: vi.fn(),
    updateTask: vi.fn(),
    createTask: vi.fn().mockResolvedValue({
      id: "task-1",
      title: "Draft task",
      createdAt: "2026-04-09T10:00:00Z",
      actionAt: null,
      completedAt: null,
      description: "",
    }),
    ...overrides,
  } as never;
}

describe("TaskListPane", () => {
  beforeEach(async () => {
    const tasksContext = await import("../../context/TasksContext");
    vi.mocked(tasksContext.useTasks).mockReturnValue(makeTasksHookValue());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps inline capture open after pressing Enter so another task can be added", async () => {
    const user = userEvent.setup();
    const tasksContext = await import("../../context/TasksContext");
    const createTask = vi.fn().mockResolvedValue({
      id: "task-1",
      title: "First task",
      createdAt: "2026-04-09T10:00:00Z",
      actionAt: null,
      completedAt: null,
      description: "",
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

  it("assigns today's date when creating a task from the Today view", async () => {
    const user = userEvent.setup();
    const tasksContext = await import("../../context/TasksContext");
    const createTask = vi.fn().mockResolvedValue({
      id: "task-1",
      title: "Today task",
      createdAt: "2026-04-09T10:00:00Z",
      actionAt: null,
      completedAt: null,
      description: "",
    });
    const updateTask = vi.fn().mockResolvedValue({
      id: "task-1",
      title: "Today task",
      createdAt: "2026-04-09T10:00:00Z",
      actionAt: localDateToNormalizedActionAt("2026-04-09"),
      completedAt: null,
      description: "",
    });

    vi.mocked(tasksContext.useTasks).mockReturnValue(
      makeTasksHookValue({
        selectedView: "today",
        createTask,
        updateTask,
      }),
    );

    render(
      <TooltipProvider>
        <TaskListPane />
      </TooltipProvider>,
    );

    await user.click(screen.getAllByRole("button", { name: "New Task" })[0]);
    await user.type(screen.getByPlaceholderText("Task name"), "Today task{enter}");

    await waitFor(() => {
      expect(updateTask).toHaveBeenCalledWith("task-1", {
        actionAt: localDateToNormalizedActionAt("2026-04-09"),
      });
    });
  });

  it("shows a detected date chip while typing a task title", async () => {
    const user = userEvent.setup();

    render(
      <TooltipProvider>
        <TaskListPane />
      </TooltipProvider>,
    );

    await user.click(screen.getAllByRole("button", { name: "New Task" })[0]);
    await user.type(screen.getByPlaceholderText("Task name"), "Pay rent tomorrow");

    await waitFor(() => {
      expect(screen.getByText("Date: Tomorrow")).toBeInTheDocument();
    });
  });

  it("creates a task with the detected date removed from the title and assigned to actionAt", async () => {
    const user = userEvent.setup();
    const tasksContext = await import("../../context/TasksContext");
    const createTask = vi.fn().mockResolvedValue({
      id: "task-1",
      title: "Pay rent",
      createdAt: "2026-04-09T10:00:00Z",
      actionAt: null,
      completedAt: null,
      description: "",
    });
    const updateTask = vi.fn().mockResolvedValue({
      id: "task-1",
      title: "Pay rent",
      createdAt: "2026-04-09T10:00:00Z",
      actionAt: localDateToNormalizedActionAt("2026-04-10"),
      completedAt: null,
      description: "",
    });

    vi.mocked(tasksContext.useTasks).mockReturnValue(
      makeTasksHookValue({ createTask, updateTask }),
    );

    render(
      <TooltipProvider>
        <TaskListPane />
      </TooltipProvider>,
    );

    await user.click(screen.getAllByRole("button", { name: "New Task" })[0]);
    await user.type(screen.getByPlaceholderText("Task name"), "Pay rent tomorrow{enter}");

    await waitFor(() => {
      expect(createTask).toHaveBeenCalledWith("Pay rent");
      expect(updateTask).toHaveBeenCalledWith("task-1", {
        actionAt: localDateToNormalizedActionAt("2026-04-10"),
      });
    });
  });

  it("lets the user dismiss a detected date before submit", async () => {
    const user = userEvent.setup();
    const tasksContext = await import("../../context/TasksContext");
    const createTask = vi.fn().mockResolvedValue({
      id: "task-1",
      title: "Pay rent tomorrow",
      createdAt: "2026-04-09T10:00:00Z",
      actionAt: null,
      completedAt: null,
      description: "",
    });
    const updateTask = vi.fn();

    vi.mocked(tasksContext.useTasks).mockReturnValue(
      makeTasksHookValue({ createTask, updateTask }),
    );

    render(
      <TooltipProvider>
        <TaskListPane />
      </TooltipProvider>,
    );

    await user.click(screen.getAllByRole("button", { name: "New Task" })[0]);
    await user.type(screen.getByPlaceholderText("Task name"), "Pay rent tomorrow");
    await waitFor(() => {
      expect(screen.getByText("Date: Tomorrow")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Dismiss detected date" }));
    expect(screen.queryByText("Date: Tomorrow")).not.toBeInTheDocument();

    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(createTask).toHaveBeenCalledWith("Pay rent tomorrow");
    });
    expect(updateTask).not.toHaveBeenCalled();
  });
});

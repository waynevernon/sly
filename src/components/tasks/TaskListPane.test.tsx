import userEvent from "@testing-library/user-event";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localDateToNormalizedActionAt, taskScheduleSelectionFromView } from "../../lib/tasks";
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
      waiting: [],
      anytime: [],
      someday: [],
      completed: [],
    },
    selectedView: "inbox",
    selectedTaskId: null,
    selectedTaskIds: [],
    today: "2026-04-09",
    isLoading: false,
    selectTask: vi.fn(),
    toggleTaskSelection: vi.fn(),
    selectTaskRange: vi.fn(),
    clearTaskSelection: vi.fn(),
    setCompleted: vi.fn(),
    updateTask: vi.fn(),
    createTask: vi.fn().mockResolvedValue({
      id: "task-1",
      title: "Draft task",
      description: "",
      link: "",
      waitingFor: "",
      createdAt: "2026-04-09T10:00:00Z",
      actionAt: null,
      scheduleBucket: null,
      completedAt: null,
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

  it("keeps inline capture open and selects the created task after pressing Enter", async () => {
    const user = userEvent.setup();
    const tasksContext = await import("../../context/TasksContext");
    const createdTask = {
      id: "task-1",
      title: "First task",
      description: "",
      link: "",
      waitingFor: "",
      createdAt: "2026-04-09T10:00:00Z",
      actionAt: null,
      scheduleBucket: null,
      completedAt: null,
    };
    const createTask = vi.fn().mockResolvedValue({
      ...createdTask,
    });
    const selectTask = vi.fn();
    const hookValue = makeTasksHookValue({ createTask, selectTask });

    vi.mocked(tasksContext.useTasks).mockReturnValue(
      hookValue,
    );

    const { rerender } = render(
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

    hookValue.buckets.inbox = [createdTask];
    rerender(
      <TooltipProvider>
        <TaskListPane />
      </TooltipProvider>,
    );

    const refreshedInput = screen.getByPlaceholderText("Task name");
    expect(refreshedInput).toHaveValue("");
    expect(refreshedInput).toHaveFocus();
    await waitFor(() => {
      expect(selectTask).toHaveBeenCalledWith("task-1");
    });
  });

  it("assigns today's date when creating a task from the Today view", async () => {
    const user = userEvent.setup();
    const tasksContext = await import("../../context/TasksContext");
    const createTask = vi.fn().mockResolvedValue({
      id: "task-1",
      title: "Today task",
      description: "",
      link: "",
      waitingFor: "",
      createdAt: "2026-04-09T10:00:00Z",
      actionAt: null,
      scheduleBucket: null,
      completedAt: null,
    });
    const updateTask = vi.fn().mockResolvedValue({
      id: "task-1",
      title: "Today task",
      description: "",
      link: "",
      waitingFor: "",
      createdAt: "2026-04-09T10:00:00Z",
      actionAt: localDateToNormalizedActionAt("2026-04-09"),
      scheduleBucket: null,
      completedAt: null,
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
        scheduleBucket: null,
      });
    });
  });

  it("assigns anytime when creating a task from the Anytime view", async () => {
    const user = userEvent.setup();
    const tasksContext = await import("../../context/TasksContext");
    const createTask = vi.fn().mockResolvedValue({
      id: "task-1",
      title: "Anytime task",
      description: "",
      link: "",
      waitingFor: "",
      createdAt: "2026-04-09T10:00:00Z",
      actionAt: null,
      scheduleBucket: null,
      completedAt: null,
    });
    const updateTask = vi.fn();

    vi.mocked(tasksContext.useTasks).mockReturnValue(
      makeTasksHookValue({
        selectedView: "anytime",
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
    await user.type(screen.getByPlaceholderText("Task name"), "Anytime task{enter}");

    await waitFor(() => {
      expect(updateTask).toHaveBeenCalledWith(
        "task-1",
        taskScheduleSelectionFromView("anytime", "2026-04-09"),
      );
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
      description: "",
      link: "",
      waitingFor: "",
      createdAt: "2026-04-09T10:00:00Z",
      actionAt: null,
      scheduleBucket: null,
      completedAt: null,
    });
    const updateTask = vi.fn().mockResolvedValue({
      id: "task-1",
      title: "Pay rent",
      description: "",
      link: "",
      waitingFor: "",
      createdAt: "2026-04-09T10:00:00Z",
      actionAt: localDateToNormalizedActionAt("2026-04-10"),
      scheduleBucket: null,
      completedAt: null,
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
        scheduleBucket: null,
      });
    });
  });

  it("lets the user dismiss a detected date before submit", async () => {
    const user = userEvent.setup();
    const tasksContext = await import("../../context/TasksContext");
    const createTask = vi.fn().mockResolvedValue({
      id: "task-1",
      title: "Pay rent tomorrow",
      description: "",
      link: "",
      waitingFor: "",
      createdAt: "2026-04-09T10:00:00Z",
      actionAt: null,
      scheduleBucket: null,
      completedAt: null,
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

  it("groups the today view into overdue and today sections", async () => {
    const tasksContext = await import("../../context/TasksContext");

    vi.mocked(tasksContext.useTasks).mockReturnValue(
      makeTasksHookValue({
        selectedView: "today",
        buckets: {
          inbox: [],
          today: [
            {
              id: "task-overdue",
              title: "Missed follow-up",
              description: "",
              link: "",
              waitingFor: "",
              createdAt: "2026-04-08T12:00:00Z",
              actionAt: localDateToNormalizedActionAt("2026-04-08"),
              scheduleBucket: null,
              completedAt: null,
            },
            {
              id: "task-today",
              title: "Ship beta",
              description: "",
              link: "",
              waitingFor: "",
              createdAt: "2026-04-09T12:00:00Z",
              actionAt: localDateToNormalizedActionAt("2026-04-09"),
              scheduleBucket: null,
              completedAt: null,
            },
          ],
          upcoming: [],
          waiting: [],
          anytime: [],
          someday: [],
          completed: [],
        },
      }),
    );

    render(
      <TooltipProvider>
        <TaskListPane />
      </TooltipProvider>,
    );

    expect(screen.getByText("Overdue")).toBeInTheDocument();
    expect(screen.getAllByText("Today")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Reschedule" })).toBeInTheDocument();
  });

  it("groups completed tasks into recency sections", async () => {
    const tasksContext = await import("../../context/TasksContext");

    vi.mocked(tasksContext.useTasks).mockReturnValue(
      makeTasksHookValue({
        selectedView: "completed",
        buckets: {
          inbox: [],
          today: [],
          upcoming: [],
          waiting: [],
          anytime: [],
          someday: [],
          completed: [
            {
              id: "task-today",
              title: "Closed today",
              description: "",
              link: "",
              waitingFor: "",
              createdAt: "2026-04-09T12:00:00Z",
              actionAt: null,
              scheduleBucket: null,
              completedAt: "2026-04-09T13:00:00Z",
            },
            {
              id: "task-yesterday",
              title: "Closed yesterday",
              description: "",
              link: "",
              waitingFor: "",
              createdAt: "2026-04-08T12:00:00Z",
              actionAt: null,
              scheduleBucket: null,
              completedAt: "2026-04-08T13:00:00Z",
            },
            {
              id: "task-earlier",
              title: "Closed earlier",
              description: "",
              link: "",
              waitingFor: "",
              createdAt: "2026-04-01T12:00:00Z",
              actionAt: null,
              scheduleBucket: null,
              completedAt: "2026-04-01T13:00:00Z",
            },
          ],
        },
      }),
    );

    render(
      <TooltipProvider>
        <TaskListPane />
      </TooltipProvider>,
    );

    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Yesterday")).toBeInTheDocument();
    expect(screen.getByText("Earlier")).toBeInTheDocument();
  });

  it("shows batch actions when multiple tasks are selected", async () => {
    const tasksContext = await import("../../context/TasksContext");

    vi.mocked(tasksContext.useTasks).mockReturnValue(
      makeTasksHookValue({
        selectedTaskIds: ["task-1", "task-2"],
        selectedTaskId: "task-1",
        buckets: {
          inbox: [
            {
              id: "task-1",
              title: "First",
              description: "",
              link: "",
              waitingFor: "",
              createdAt: "2026-04-08T12:00:00Z",
              actionAt: null,
              scheduleBucket: null,
              completedAt: null,
            },
            {
              id: "task-2",
              title: "Second",
              description: "",
              link: "",
              waitingFor: "",
              createdAt: "2026-04-09T12:00:00Z",
              actionAt: null,
              scheduleBucket: null,
              completedAt: null,
            },
          ],
          today: [],
          upcoming: [],
          waiting: [],
          anytime: [],
          someday: [],
          completed: [],
        },
      }),
    );

    render(
      <TooltipProvider>
        <TaskListPane />
      </TooltipProvider>,
    );

    expect(screen.getByText("2 selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reschedule" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete Selected Tasks" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear Selection" })).toBeInTheDocument();
  });

  it("shows waiting tasks in a dedicated waiting view with grouped sections", async () => {
    const tasksContext = await import("../../context/TasksContext");

    vi.mocked(tasksContext.useTasks).mockReturnValue(
      makeTasksHookValue({
        selectedView: "waiting",
        buckets: {
          inbox: [],
          today: [],
          upcoming: [],
          waiting: [
            {
              id: "task-overdue",
              title: "Need finance reply",
              description: "",
              link: "",
              waitingFor: "Finance",
              createdAt: "2026-04-08T12:00:00Z",
              actionAt: localDateToNormalizedActionAt("2026-04-08"),
              scheduleBucket: null,
              completedAt: null,
            },
            {
              id: "task-anytime",
              title: "Need design input",
              description: "",
              link: "",
              waitingFor: "Design",
              createdAt: "2026-04-09T12:00:00Z",
              actionAt: null,
              scheduleBucket: "anytime",
              completedAt: null,
            },
          ],
          anytime: [],
          someday: [],
          completed: [],
        },
      }),
    );

    render(
      <TooltipProvider>
        <TaskListPane />
      </TooltipProvider>,
    );

    expect(screen.getByText("Overdue")).toBeInTheDocument();
    expect(screen.getByText("Anytime")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New Task" })).not.toBeInTheDocument();
  });
});

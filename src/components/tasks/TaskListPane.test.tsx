import userEvent from "@testing-library/user-event";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localDateToNormalizedActionAt, taskScheduleSelectionFromView } from "../../lib/tasks";
import { TooltipProvider } from "../ui";
import { TaskListPane } from "./TaskListPane";

vi.mock("@dnd-kit/core", async () => {
  const actual = await vi.importActual("@dnd-kit/core");
  return { ...(actual as object), useDndMonitor: vi.fn() };
});

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
    tasks: [],
    buckets: {
      inbox: [],
      today: [],
      upcoming: [],
      waiting: [],
      anytime: [],
      someday: [],
      completed: [],
      starred: [],
    },
    selectedView: "inbox",
    selectedTaskId: null,
    selectedTaskIds: [],
    today: "2026-04-09",
    isLoading: false,
    taskSortMode: "createdAsc",
    setTaskSortMode: vi.fn(),
    taskViewOrders: {},
    setTaskViewOrder: vi.fn(),
    selectTask: vi.fn(),
    toggleTaskSelection: vi.fn(),
    selectTaskRange: vi.fn(),
    clearTaskSelection: vi.fn(),
    setCompleted: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn().mockResolvedValue(undefined),
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
      starred: false,
      dueAt: null,
      recurrence: null,
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
      starred: false,
      dueAt: null,
      recurrence: null,
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

    await user.click(screen.getAllByRole("button", { name: "New task" })[0]);

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

    await user.click(screen.getAllByRole("button", { name: "New task" })[0]);
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

    await user.click(screen.getAllByRole("button", { name: "New task" })[0]);
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

    await user.click(screen.getAllByRole("button", { name: "New task" })[0]);
    await user.type(screen.getByPlaceholderText("Task name"), "Pay rent tomorrow");

    await waitFor(() => {
      expect(screen.getByText("Date: Tomorrow")).toBeInTheDocument();
    });
  });

  it("reorders tasks that are missing from the persisted manual order", async () => {
    const tasksContext = await import("../../context/TasksContext");
    const dndKit = await import("@dnd-kit/core");
    const setTaskViewOrder = vi.fn();
    const firstTask = {
      id: "task-1",
      title: "First task",
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
    };
    const secondTask = {
      id: "task-2",
      title: "Second task",
      description: "",
      link: "",
      waitingFor: "",
      createdAt: "2026-04-09T11:00:00Z",
      actionAt: null,
      scheduleBucket: null,
      completedAt: null,
      starred: false,
      dueAt: null,
      recurrence: null,
    };

    vi.mocked(tasksContext.useTasks).mockReturnValue(
      makeTasksHookValue({
        selectedView: "inbox",
        taskSortMode: "manual",
        buckets: {
          inbox: [firstTask, secondTask],
          today: [],
          upcoming: [],
          waiting: [],
          anytime: [],
          someday: [],
          completed: [],
          starred: [],
        },
        taskViewOrders: { inbox: ["task-1"] },
        setTaskViewOrder,
      }),
    );

    render(
      <TooltipProvider>
        <TaskListPane />
      </TooltipProvider>,
    );

    const dndMonitorCalls = vi.mocked(dndKit.useDndMonitor).mock.calls;
    const monitor = dndMonitorCalls[dndMonitorCalls.length - 1]?.[0];
    expect(monitor).toBeDefined();

    monitor?.onDragEnd?.({
      active: { data: { current: { type: "task", id: "task-2" } } },
      over: { data: { current: { type: "task", id: "task-1" } } },
    } as never);

    expect(setTaskViewOrder).toHaveBeenCalledWith("inbox", ["task-2", "task-1"]);
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

    await user.click(screen.getAllByRole("button", { name: "New task" })[0]);
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

    await user.click(screen.getAllByRole("button", { name: "New task" })[0]);
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
              starred: false,
              dueAt: null,
              recurrence: null,
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
              starred: false,
              dueAt: null,
              recurrence: null,
            },
          ],
          upcoming: [],
          waiting: [],
          anytime: [],
          someday: [],
          completed: [],
          starred: [],
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
              starred: false,
              dueAt: null,
              recurrence: null,
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
              starred: false,
              dueAt: null,
              recurrence: null,
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
              starred: false,
              dueAt: null,
              recurrence: null,
            },
          ],
          starred: [],
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
              starred: false,
              dueAt: null,
              recurrence: null,
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
              starred: false,
              dueAt: null,
              recurrence: null,
            },
          ],
          today: [],
          upcoming: [],
          waiting: [],
          anytime: [],
          someday: [],
          completed: [],
          starred: [],
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
    expect(screen.getByRole("button", { name: "Delete selected tasks" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear selection" })).toBeInTheDocument();
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
              starred: false,
              dueAt: null,
              recurrence: null,
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
              starred: false,
              dueAt: null,
              recurrence: null,
            },
          ],
          anytime: [],
          someday: [],
          completed: [],
          starred: [],
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
    expect(screen.queryByRole("button", { name: "New task" })).not.toBeInTheDocument();
  });

  it("opens the search input when the search button is clicked", async () => {
    const user = userEvent.setup();
    render(<TooltipProvider><TaskListPane /></TooltipProvider>);

    expect(screen.queryByPlaceholderText("Search tasks…")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Search tasks" }));
    expect(screen.getByPlaceholderText("Search tasks…")).toBeInTheDocument();
  });

  it("opens the search input when the global task search event is dispatched", () => {
    render(<TooltipProvider><TaskListPane /></TooltipProvider>);

    expect(screen.queryByPlaceholderText("Search tasks…")).not.toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new CustomEvent("open-tasks-search"));
    });

    expect(screen.getByPlaceholderText("Search tasks…")).toBeInTheDocument();
  });

  it("starts inline task creation when the global inline-create event is dispatched", () => {
    render(<TooltipProvider><TaskListPane /></TooltipProvider>);

    expect(screen.queryByPlaceholderText("Task name")).not.toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new CustomEvent("start-inline-task-create"));
    });

    expect(screen.getByPlaceholderText("Task name")).toBeInTheDocument();
  });

  it("ignores the global inline-create event in non-inline task views", async () => {
    const tasksContext = await import("../../context/TasksContext");

    vi.mocked(tasksContext.useTasks).mockReturnValue(
      makeTasksHookValue({
        selectedView: "upcoming",
      }),
    );

    render(<TooltipProvider><TaskListPane /></TooltipProvider>);

    act(() => {
      window.dispatchEvent(new CustomEvent("start-inline-task-create"));
    });

    expect(screen.queryByPlaceholderText("Task name")).not.toBeInTheDocument();
  });

  it("shows matching task rows when a query is typed", async () => {
    const user = userEvent.setup();
    const tasksContext = await import("../../context/TasksContext");

    vi.mocked(tasksContext.useTasks).mockReturnValue(
      makeTasksHookValue({
        tasks: [
          { id: "t1", title: "Fix login bug", description: "", link: "", waitingFor: "", createdAt: "2026-04-09T10:00:00Z", actionAt: null, scheduleBucket: null, completedAt: null, starred: false, dueAt: null, recurrence: null },
          { id: "t2", title: "Write unit tests", description: "", link: "", waitingFor: "", createdAt: "2026-04-09T10:00:00Z", actionAt: null, scheduleBucket: null, completedAt: null, starred: false, dueAt: null, recurrence: null },
          { id: "t3", title: "Deploy hotfix", description: "", link: "", waitingFor: "", createdAt: "2026-04-09T10:00:00Z", actionAt: null, scheduleBucket: null, completedAt: null, starred: false, dueAt: null, recurrence: null },
        ],
      }),
    );

    render(<TooltipProvider><TaskListPane /></TooltipProvider>);

    await user.click(screen.getByRole("button", { name: "Search tasks" }));
    await user.type(screen.getByPlaceholderText("Search tasks…"), "fix");

    // "Fix login bug" and "Deploy hotfix" match; "Write unit tests" does not
    await waitFor(() => {
      expect(screen.getAllByTestId("task-row")).toHaveLength(2);
    });
  });

  it("shows empty state when no tasks match the search query", async () => {
    const user = userEvent.setup();
    const tasksContext = await import("../../context/TasksContext");

    vi.mocked(tasksContext.useTasks).mockReturnValue(
      makeTasksHookValue({
        tasks: [
          { id: "t1", title: "Buy groceries", description: "", link: "", waitingFor: "", createdAt: "2026-04-09T10:00:00Z", actionAt: null, scheduleBucket: null, completedAt: null, starred: false, dueAt: null, recurrence: null },
        ],
      }),
    );

    render(<TooltipProvider><TaskListPane /></TooltipProvider>);

    await user.click(screen.getByRole("button", { name: "Search tasks" }));
    await user.type(screen.getByPlaceholderText("Search tasks…"), "zzznomatch");

    await waitFor(() => {
      expect(screen.getByText("No matching tasks")).toBeInTheDocument();
    });
  });

  it("closes search and resets header when Escape is pressed on an empty input", async () => {
    const user = userEvent.setup();
    render(<TooltipProvider><TaskListPane /></TooltipProvider>);

    await user.click(screen.getByRole("button", { name: "Search tasks" }));
    const input = screen.getByPlaceholderText("Search tasks…");
    await user.click(input);

    await user.keyboard("{Escape}");
    expect(screen.queryByPlaceholderText("Search tasks…")).not.toBeInTheDocument();
    expect(screen.getByText("Inbox")).toBeInTheDocument();
  });
});

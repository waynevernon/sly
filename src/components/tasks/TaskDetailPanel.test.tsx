import userEvent from "@testing-library/user-event";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "../ui";
import { TaskDetailPanel } from "./TaskDetailPanel";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("../../context/TasksContext", () => ({
  useTasks: vi.fn(),
}));

type TasksHookValue = ReturnType<
  typeof import("../../context/TasksContext").useTasks
>;

function makeTasksHookValue(
  overrides: Partial<TasksHookValue> = {},
): TasksHookValue {
  return {
    tasks: [
      {
        id: "task-1",
        title: "Follow up",
        description: "",
        link: "",
        waitingFor: "",
        createdAt: "2026-04-10T12:00:00Z",
        actionAt: null,
        scheduleBucket: null,
        completedAt: null,
        starred: false,
        dueAt: null,
        recurrence: null,
      },
      {
        id: "task-2",
        title: "Review docs",
        description: "",
        link: "",
        waitingFor: "Jordan",
        createdAt: "2026-04-10T11:00:00Z",
        actionAt: null,
        scheduleBucket: null,
        completedAt: null,
        starred: false,
        dueAt: null,
        recurrence: null,
      },
      {
        id: "task-3",
        title: "Check contract",
        description: "",
        link: "",
        waitingFor: "Jordan",
        createdAt: "2026-04-10T10:00:00Z",
        actionAt: null,
        scheduleBucket: null,
        completedAt: null,
        starred: false,
        dueAt: null,
        recurrence: null,
      },
      {
        id: "task-4",
        title: "Ask legal",
        description: "",
        link: "",
        waitingFor: "Legal",
        createdAt: "2026-04-10T09:00:00Z",
        actionAt: null,
        scheduleBucket: null,
        completedAt: null,
        starred: false,
        dueAt: null,
        recurrence: null,
      },
    ],
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
    today: "2026-04-10",
    isLoading: false,
    lastError: null,
    selectedView: "inbox",
    selectedTaskId: "task-1",
    selectedTaskIds: ["task-1"],
    selectedTask: {
      id: "task-1",
      title: "Follow up",
      description: "",
      link: "",
      waitingFor: "",
      createdAt: "2026-04-10T12:00:00Z",
      actionAt: null,
      scheduleBucket: null,
      completedAt: null,
      starred: false,
      dueAt: null,
      recurrence: null,
    },
    isLoadingTask: false,
    taskSortMode: "createdAsc",
    setTaskSortMode: vi.fn(),
    taskViewOrders: {},
    setTaskViewOrder: vi.fn(),
    selectView: vi.fn(),
    selectTask: vi.fn(),
    toggleTaskSelection: vi.fn(),
    selectTaskRange: vi.fn(),
    clearTaskSelection: vi.fn(),
    createTask: vi.fn(),
    updateTask: vi.fn().mockResolvedValue(null),
    setCompleted: vi.fn(),
    deleteTask: vi.fn(),
    refreshTasks: vi.fn(),
    ...overrides,
  } as never;
}

describe("TaskDetailPanel", () => {
  beforeEach(async () => {
    const tasksContext = await import("../../context/TasksContext");
    vi.mocked(tasksContext.useTasks).mockReturnValue(makeTasksHookValue());
  });

  it("suggests reused waiting-for values and applies a selected suggestion", async () => {
    const user = userEvent.setup();
    const tasksContext = await import("../../context/TasksContext");
    const updateTask = vi.fn().mockResolvedValue(null);

    vi.mocked(tasksContext.useTasks).mockReturnValue(
      makeTasksHookValue({ updateTask }),
    );

    render(
      <TooltipProvider>
        <TaskDetailPanel />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Waiting" }));

    const input = await screen.findByPlaceholderText("Waiting…");
    await user.type(input, "jo");

    expect(await screen.findByRole("button", { name: /Jordan/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Jordan/i }));

    await waitFor(() => {
      expect(updateTask).toHaveBeenCalledWith("task-1", { waitingFor: "Jordan" });
    });
    expect(screen.getByRole("button", { name: "Waiting Jordan" })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Waiting…")).not.toBeInTheDocument();
  });

  it("commits and collapses the waiting-for field on Enter", async () => {
    const user = userEvent.setup();
    const tasksContext = await import("../../context/TasksContext");
    const updateTask = vi.fn().mockResolvedValue(null);

    vi.mocked(tasksContext.useTasks).mockReturnValue(
      makeTasksHookValue({ updateTask }),
    );

    render(
      <TooltipProvider>
        <TaskDetailPanel />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Waiting" }));
    const input = await screen.findByPlaceholderText("Waiting…");
    await user.type(input, "Jordan{enter}");

    await waitFor(() => {
      expect(updateTask).toHaveBeenCalledWith("task-1", { waitingFor: "Jordan" });
    });
    expect(screen.getByRole("button", { name: "Waiting Jordan" })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Waiting…")).not.toBeInTheDocument();
  });

  it("collapses back to the idle button when blurred empty", async () => {
    const user = userEvent.setup();

    render(
      <TooltipProvider>
        <TaskDetailPanel />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Waiting" }));
    const input = await screen.findByPlaceholderText("Waiting…");
    await user.click(input);
    await user.tab();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Waiting" })).toBeInTheDocument();
    });
    expect(screen.queryByPlaceholderText("Waiting…")).not.toBeInTheDocument();
  });

  it("shows the created timestamp and omits completed when the task is still open", () => {
    render(
      <TooltipProvider>
        <TaskDetailPanel />
      </TooltipProvider>,
    );

    expect(screen.getByText(/Created/)).toBeInTheDocument();
    expect(
      screen.getByText(
        new RegExp(`Created\\s+${escapeRegExp(formatTaskTimestampForTest("2026-04-10T12:00:00Z"))}`),
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Completed")).not.toBeInTheDocument();
  });

  it("shows the completed timestamp when the task is done", async () => {
    const tasksContext = await import("../../context/TasksContext");

    vi.mocked(tasksContext.useTasks).mockReturnValue(
      makeTasksHookValue({
        selectedTask: {
          id: "task-1",
          title: "Follow up",
          description: "",
          link: "",
          waitingFor: "",
          createdAt: "2026-04-10T12:00:00Z",
          actionAt: null,
          scheduleBucket: null,
          completedAt: "2026-04-11T09:15:00Z",
          starred: false,
          dueAt: null,
          recurrence: null,
        },
      }),
    );

    render(
      <TooltipProvider>
        <TaskDetailPanel />
      </TooltipProvider>,
    );

    expect(screen.getByText(/Completed/)).toBeInTheDocument();
    expect(
      screen.getByText(
        new RegExp(`Completed\\s+${escapeRegExp(formatTaskTimestampForTest("2026-04-11T09:15:00Z"))}`),
      ),
    ).toBeInTheDocument();
  });

  it("shows a tooltip for the open link action", async () => {
    const user = userEvent.setup();
    const tasksContext = await import("../../context/TasksContext");

    vi.mocked(tasksContext.useTasks).mockReturnValue(
      makeTasksHookValue({
        selectedTask: {
          id: "task-1",
          title: "Follow up",
          description: "",
          link: "https://example.com",
          waitingFor: "",
          createdAt: "2026-04-10T12:00:00Z",
          actionAt: null,
          scheduleBucket: null,
          completedAt: null,
          starred: false,
          dueAt: null,
          recurrence: null,
        },
      }),
    );

    render(
      <TooltipProvider>
        <TaskDetailPanel />
      </TooltipProvider>,
    );

    await user.hover(screen.getByRole("button", { name: "Open link" }));

    expect(await screen.findByRole("tooltip")).toHaveTextContent("Open link");
  });

  it("flushes a pending edit before switching to a different task", async () => {
    const tasksContext = await import("../../context/TasksContext");
    const updateTask = vi.fn().mockResolvedValue(null);
    let currentValue = makeTasksHookValue({ updateTask });

    vi.mocked(tasksContext.useTasks).mockImplementation(() => currentValue);

    const { rerender } = render(
      <TooltipProvider>
        <TaskDetailPanel />
      </TooltipProvider>,
    );

    const titleInput = screen.getByPlaceholderText("Task name");
    fireEvent.change(titleInput, {
      target: { value: "Follow up with vendor" },
    });

    currentValue = makeTasksHookValue({
      updateTask,
      selectedTaskId: "task-2",
      selectedTaskIds: ["task-2"],
      selectedTask: {
        id: "task-2",
        title: "Review docs",
        description: "",
        link: "",
        waitingFor: "Jordan",
        createdAt: "2026-04-10T11:00:00Z",
        actionAt: null,
        scheduleBucket: null,
        completedAt: null,
        starred: false,
        dueAt: null,
        recurrence: null,
      },
    });

    rerender(
      <TooltipProvider>
        <TaskDetailPanel />
      </TooltipProvider>,
    );

    await waitFor(() => {
      expect(updateTask).toHaveBeenCalledWith("task-1", {
        title: "Follow up with vendor",
      });
    });
  });

  it("keeps showing the previous task while the next task is loading", async () => {
    const tasksContext = await import("../../context/TasksContext");
    let currentValue = makeTasksHookValue();

    vi.mocked(tasksContext.useTasks).mockImplementation(() => currentValue);

    const { rerender } = render(
      <TooltipProvider>
        <TaskDetailPanel />
      </TooltipProvider>,
    );

    expect(screen.getByDisplayValue("Follow up")).toBeInTheDocument();

    currentValue = makeTasksHookValue({
      selectedTaskId: "task-2",
      selectedTaskIds: ["task-2"],
      isLoadingTask: true,
      selectedTask: {
        id: "task-1",
        title: "Follow up",
        description: "",
        link: "",
        waitingFor: "",
        createdAt: "2026-04-10T12:00:00Z",
        actionAt: null,
        scheduleBucket: null,
        completedAt: null,
        starred: false,
        dueAt: null,
        recurrence: null,
      },
    });

    rerender(
      <TooltipProvider>
        <TaskDetailPanel />
      </TooltipProvider>,
    );

    expect(screen.getByDisplayValue("Follow up")).toBeInTheDocument();
    expect(screen.queryByText("Loading task")).not.toBeInTheDocument();
  });

  it("stars and unstars the task from the inline title action", async () => {
    const user = userEvent.setup();
    const tasksContext = await import("../../context/TasksContext");
    const updateTask = vi.fn().mockResolvedValue(null);

    vi.mocked(tasksContext.useTasks).mockReturnValue(
      makeTasksHookValue({ updateTask }),
    );

    render(
      <TooltipProvider>
        <TaskDetailPanel />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Star task" }));

    await waitFor(() => {
      expect(updateTask).toHaveBeenCalledWith("task-1", { starred: true });
    });

    // Now render with the task already starred
    vi.mocked(tasksContext.useTasks).mockReturnValue(
      makeTasksHookValue({
        updateTask,
        selectedTask: {
          id: "task-1",
          title: "Follow up",
          description: "",
          link: "",
          waitingFor: "",
          createdAt: "2026-04-10T12:00:00Z",
          actionAt: null,
          scheduleBucket: null,
          completedAt: null,
          starred: true,
          dueAt: null,
          recurrence: null,
        },
      }),
    );

    render(
      <TooltipProvider>
        <TaskDetailPanel />
      </TooltipProvider>,
    );

    await user.click(screen.getAllByRole("button", { name: "Unstar task" })[0]);

    await waitFor(() => {
      expect(updateTask).toHaveBeenCalledWith("task-1", { starred: false });
    });
  });
});

function formatTaskTimestampForTest(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

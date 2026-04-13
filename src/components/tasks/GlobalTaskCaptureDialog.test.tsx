import userEvent from "@testing-library/user-event";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { localDateToNormalizedActionAt } from "../../lib/tasks";
import { TooltipProvider } from "../ui";
import { GlobalTaskCaptureDialog } from "./GlobalTaskCaptureDialog";

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
    today: "2026-04-10",
    isLoading: false,
    lastError: null,
    selectedView: "inbox",
    selectedTaskId: null,
    selectedTaskIds: [],
    selectedTask: null,
    isLoadingTask: false,
    taskSortMode: "createdAsc",
    setTaskSortMode: vi.fn(),
    selectView: vi.fn(),
    selectTask: vi.fn(),
    toggleTaskSelection: vi.fn(),
    selectTaskRange: vi.fn(),
    clearTaskSelection: vi.fn(),
    createTask: vi.fn().mockResolvedValue({
      id: "task-1",
      title: "Pay rent",
      description: "",
      link: "",
      waitingFor: "",
      createdAt: "2026-04-10T12:00:00Z",
      actionAt: null,
      scheduleBucket: null,
      completedAt: null,
      starred: false,
    }),
    updateTask: vi.fn().mockResolvedValue({
      id: "task-1",
      title: "Pay rent",
      description: "Before noon",
      link: "https://example.com",
      waitingFor: "",
      createdAt: "2026-04-10T12:00:00Z",
      actionAt: "2026-04-10T17:00:00.000Z",
      scheduleBucket: null,
      completedAt: null,
      starred: false,
    }),
    setCompleted: vi.fn(),
    deleteTask: vi.fn(),
    refreshTasks: vi.fn(),
    ...overrides,
  } as never;
}

describe("GlobalTaskCaptureDialog", () => {
  beforeEach(async () => {
    const tasksContext = await import("../../context/TasksContext");
    vi.mocked(tasksContext.useTasks).mockReturnValue(makeTasksHookValue());
  });

  it("creates a task with details and a detected date when opened in task mode", async () => {
    const user = userEvent.setup();
    const tasksContext = await import("../../context/TasksContext");
    const createTask = vi.fn().mockResolvedValue({
      id: "task-1",
      title: "Pay rent",
      description: "",
      link: "",
      waitingFor: "",
      createdAt: "2026-04-10T12:00:00Z",
      actionAt: null,
      scheduleBucket: null,
      completedAt: null,
    });
    const updateTask = vi.fn().mockResolvedValue({
      id: "task-1",
      title: "Pay rent",
      description: "Before noon",
      link: "https://example.com",
      waitingFor: "Jordan",
      createdAt: "2026-04-10T12:00:00Z",
      actionAt: "2026-04-11T17:00:00.000Z",
      scheduleBucket: null,
      completedAt: null,
    });
    const selectView = vi.fn();
    const selectTask = vi.fn();
    const onClose = vi.fn();

    vi.mocked(tasksContext.useTasks).mockReturnValue(
      makeTasksHookValue({ createTask, updateTask, selectView, selectTask }),
    );

    render(
      <TooltipProvider>
        <GlobalTaskCaptureDialog
          open
          workspaceMode="tasks"
          onClose={onClose}
        />
      </TooltipProvider>,
    );

    await user.type(
      screen.getByPlaceholderText("What needs doing?"),
      "Pay rent tomorrow",
    );
    await screen.findByText("Date: Tomorrow");
    await user.type(screen.getByPlaceholderText("Waiting for…"), "Jordan");
    await user.type(screen.getByPlaceholderText("Add link…"), "example.com");
    await user.type(screen.getByPlaceholderText("Add description…"), "Before noon");
    await user.click(screen.getByRole("button", { name: "Create Task" }));

    await waitFor(() => {
      expect(createTask).toHaveBeenCalledWith("Pay rent");
      expect(updateTask).toHaveBeenCalledWith("task-1", {
        description: "Before noon",
        link: "example.com",
        waitingFor: "Jordan",
        actionAt: localDateToNormalizedActionAt("2026-04-11"),
        scheduleBucket: null,
      });
      expect(selectView).toHaveBeenCalledWith("upcoming");
      expect(selectTask).toHaveBeenCalledWith("task-1");
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("can dismiss a detected date before submit", async () => {
    const user = userEvent.setup();
    const tasksContext = await import("../../context/TasksContext");
    const createTask = vi.fn().mockResolvedValue({
      id: "task-1",
      title: "Plan tomorrow",
      description: "",
      link: "",
      waitingFor: "",
      createdAt: "2026-04-10T12:00:00Z",
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
        <GlobalTaskCaptureDialog
          open
          workspaceMode="notes"
          onClose={vi.fn()}
        />
      </TooltipProvider>,
    );

    await user.type(
      screen.getByPlaceholderText("What needs doing?"),
      "Plan tomorrow",
    );
    await screen.findByText("Date: Tomorrow");
    await user.click(screen.getByRole("button", { name: "Dismiss detected date" }));
    await waitFor(() => {
      expect(screen.queryByText("Date: Tomorrow")).not.toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "Create Task" }));

    await waitFor(() => {
      expect(createTask).toHaveBeenCalledWith("Plan tomorrow");
    });
    expect(updateTask).not.toHaveBeenCalled();
  });

  it("creates without changing task selection in notes mode", async () => {
    const user = userEvent.setup();
    const tasksContext = await import("../../context/TasksContext");
    const createTask = vi.fn().mockResolvedValue({
      id: "task-1",
      title: "Brain dump",
      description: "",
      link: "",
      waitingFor: "",
      createdAt: "2026-04-10T12:00:00Z",
      actionAt: null,
      scheduleBucket: null,
      completedAt: null,
    });
    const selectView = vi.fn();
    const selectTask = vi.fn();

    vi.mocked(tasksContext.useTasks).mockReturnValue(
      makeTasksHookValue({ createTask, selectView, selectTask }),
    );

    render(
      <TooltipProvider>
        <GlobalTaskCaptureDialog
          open
          workspaceMode="notes"
          onClose={vi.fn()}
        />
      </TooltipProvider>,
    );

    await user.type(screen.getByPlaceholderText("What needs doing?"), "Brain dump");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(createTask).toHaveBeenCalledWith("Brain dump");
    });

    expect(selectView).not.toHaveBeenCalled();
    expect(selectTask).not.toHaveBeenCalled();
  });

  it("autocompletes waiting for from existing task values", async () => {
    const user = userEvent.setup();
    const tasksContext = await import("../../context/TasksContext");

    vi.mocked(tasksContext.useTasks).mockReturnValue(
      makeTasksHookValue({
        tasks: [
          {
            id: "task-a",
            title: "Follow up",
            description: "",
            link: "",
            waitingFor: "Jordan",
            createdAt: "2026-04-09T12:00:00Z",
            actionAt: null,
            scheduleBucket: null,
            completedAt: null,
            starred: false,
          },
          {
            id: "task-b",
            title: "Review",
            description: "",
            link: "",
            waitingFor: "Legal",
            createdAt: "2026-04-08T12:00:00Z",
            actionAt: null,
            scheduleBucket: null,
            completedAt: null,
            starred: false,
          },
        ],
      }),
    );

    render(
      <TooltipProvider>
        <GlobalTaskCaptureDialog
          open
          workspaceMode="tasks"
          onClose={vi.fn()}
        />
      </TooltipProvider>,
    );

    const input = screen.getByPlaceholderText("Waiting for…");
    await user.click(input);
    await screen.findByRole("button", { name: "Jordan" });
    await user.type(input, "jor");
    await user.click(screen.getByRole("button", { name: "Jordan" }));

    expect(screen.getByPlaceholderText("Waiting for…")).toHaveValue("Jordan");
  });
});

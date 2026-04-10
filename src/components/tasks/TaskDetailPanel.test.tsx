import userEvent from "@testing-library/user-event";
import { render, screen, waitFor } from "@testing-library/react";
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
      },
    ],
    buckets: {
      inbox: [],
      today: [],
      upcoming: [],
      anytime: [],
      someday: [],
      completed: [],
    },
    today: "2026-04-10",
    isLoading: false,
    lastError: null,
    selectedView: "inbox",
    selectedTaskId: "task-1",
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
    },
    isLoadingTask: false,
    selectView: vi.fn(),
    selectTask: vi.fn(),
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

    await user.click(screen.getByRole("button", { name: "Waiting for" }));

    const input = await screen.findByPlaceholderText("Waiting for…");
    await user.type(input, "jo");

    expect(await screen.findByRole("button", { name: /Jordan/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Jordan/i }));

    await waitFor(() => {
      expect(updateTask).toHaveBeenCalledWith("task-1", { waitingFor: "Jordan" });
    });
  });
});

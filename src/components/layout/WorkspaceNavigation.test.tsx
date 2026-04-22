import { act, render } from "@testing-library/react";
import { type ReactNode, useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { localDateToNormalizedActionAt } from "../../lib/tasks";
import { WorkspaceNavigation } from "./WorkspaceNavigation";

let latestDndProps: Record<string, unknown> | null = null;
let foldersPaneMountCount = 0;

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({
    children,
    ...props
  }: {
    children: ReactNode;
  }) => {
    latestDndProps = props;
    return <div>{children}</div>;
  },
  DragOverlay: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PointerSensor: class PointerSensor {},
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn((...sensors: unknown[]) => sensors),
}));

vi.mock("../../context/NotesContext", () => ({
  useNotes: vi.fn(),
}));

vi.mock("../../context/TasksContext", () => ({
  useTasks: vi.fn(),
}));

vi.mock("../../context/ThemeContext", () => ({
  useTheme: vi.fn(),
}));

vi.mock("./FoldersPane", () => ({
  FoldersPane: () => {
    useEffect(() => {
      foldersPaneMountCount += 1;
    }, []);

    return <div data-testid="folders-pane" />;
  },
}));

vi.mock("./NotesPane", () => ({
  NotesPane: () => <div data-testid="notes-pane" />,
}));

vi.mock("../tasks/TaskListPane", () => ({
  TaskListPane: () => <div data-testid="task-list-pane" />,
}));

vi.mock("../tasks/TaskNavigationPane", () => ({
  TaskNavigationPane: () => <div data-testid="task-navigation-pane" />,
}));

type NotesHookValue = ReturnType<
  typeof import("../../context/NotesContext").useNotes
>;
type TasksHookValue = ReturnType<
  typeof import("../../context/TasksContext").useTasks
>;

function makeNotesHookValue(
  overrides: Partial<NotesHookValue> = {},
): NotesHookValue {
  return {
    moveFolder: vi.fn(),
    moveNote: vi.fn(),
    moveSelectedNotes: vi.fn(),
    revealFolder: vi.fn(),
    folderAppearances: {},
    ...overrides,
  } as never;
}

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
    today: "2026-04-11",
    isLoading: false,
    lastError: null,
    selectedView: "inbox",
    selectedTaskId: null,
    selectedTaskIds: [],
    selectedTask: null,
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
    updateTask: vi.fn(),
    setCompleted: vi.fn(),
    deleteTask: vi.fn(),
    refreshTasks: vi.fn(),
    ...overrides,
  } as never;
}

describe("WorkspaceNavigation", () => {
  beforeEach(async () => {
    latestDndProps = null;
    foldersPaneMountCount = 0;

    const notesContext = await import("../../context/NotesContext");
    vi.mocked(notesContext.useNotes).mockReturnValue(makeNotesHookValue());

    const tasksContext = await import("../../context/TasksContext");
    vi.mocked(tasksContext.useTasks).mockReturnValue(makeTasksHookValue());

    const themeContext = await import("../../context/ThemeContext");
    vi.mocked(themeContext.useTheme).mockReturnValue({
      foldersPaneWidth: 240,
      notesPaneWidth: 280,
      resolvedTheme: "light",
      setPaneWidths: vi.fn(),
    } as never);

  });

  it("moves folders into another folder on drop", async () => {
    const notesContext = await import("../../context/NotesContext");
    const moveFolder = vi.fn();
    const revealFolder = vi.fn();

    vi.mocked(notesContext.useNotes).mockReturnValue(
      makeNotesHookValue({ moveFolder, revealFolder }),
    );

    render(<WorkspaceNavigation paneMode={3} workspaceMode="notes" />);

    await act(async () => {
      await (latestDndProps?.onDragEnd as ((event: unknown) => Promise<void>))?.({
        active: {
          data: {
            current: {
              type: "folder",
              path: "source/moved",
            },
          },
        },
        over: {
          data: {
            current: {
              type: "folder-drop-target",
              path: "target",
            },
          },
        },
      });
    });

    expect(moveFolder).toHaveBeenCalledWith("source/moved", "target");
    expect(revealFolder).toHaveBeenCalledWith("target");
  });

  it("moves folders to root when dropped on Notes", async () => {
    const notesContext = await import("../../context/NotesContext");
    const moveFolder = vi.fn();

    vi.mocked(notesContext.useNotes).mockReturnValue(
      makeNotesHookValue({ moveFolder }),
    );

    render(<WorkspaceNavigation paneMode={3} workspaceMode="notes" />);

    await act(async () => {
      await (latestDndProps?.onDragEnd as ((event: unknown) => Promise<void>))?.({
        active: {
          data: {
            current: {
              type: "folder",
              path: "source/moved",
            },
          },
        },
        over: {
          data: {
            current: {
              type: "folder-drop-target",
              path: "",
            },
          },
        },
      });
    });

    expect(moveFolder).toHaveBeenCalledWith("source/moved", "");
  });

  it("keeps note dragging routed through the note move actions", async () => {
    const notesContext = await import("../../context/NotesContext");
    const moveNote = vi.fn();
    const moveSelectedNotes = vi.fn();
    const revealFolder = vi.fn();

    vi.mocked(notesContext.useNotes).mockReturnValue(
      makeNotesHookValue({ moveNote, moveSelectedNotes, revealFolder }),
    );

    render(<WorkspaceNavigation paneMode={3} workspaceMode="notes" />);

    await act(async () => {
      await (latestDndProps?.onDragEnd as ((event: unknown) => Promise<void>))?.({
        active: {
          data: {
            current: {
              type: "note",
              id: "alpha",
            },
          },
        },
        over: {
          data: {
            current: {
              type: "folder-drop-target",
              path: "archive",
            },
          },
        },
      });
    });

    expect(moveNote).toHaveBeenCalledWith("alpha", "archive");
    expect(moveSelectedNotes).not.toHaveBeenCalled();
    expect(revealFolder).toHaveBeenCalledWith("archive");
  });

  it("renders the task list pane instead of the notes pane in task mode", async () => {
    const { getByTestId, queryByTestId } = render(
      <WorkspaceNavigation paneMode={3} workspaceMode="tasks" />,
    );

    expect(getByTestId("task-list-pane")).toBeInTheDocument();
    expect(getByTestId("task-navigation-pane")).toBeInTheDocument();
    expect(getByTestId("folders-pane")).not.toBeVisible();
    expect(queryByTestId("notes-pane")).not.toBeInTheDocument();
  });

  it("keeps the folders pane mounted across notes and task mode switches", async () => {
    const { rerender, getByTestId } = render(
      <WorkspaceNavigation paneMode={3} workspaceMode="notes" />,
    );

    expect(getByTestId("folders-pane")).toBeVisible();
    expect(foldersPaneMountCount).toBe(1);

    rerender(<WorkspaceNavigation paneMode={3} workspaceMode="tasks" />);

    expect(getByTestId("folders-pane")).not.toBeVisible();
    expect(foldersPaneMountCount).toBe(1);

    rerender(<WorkspaceNavigation paneMode={3} workspaceMode="notes" />);

    expect(getByTestId("folders-pane")).toBeVisible();
    expect(foldersPaneMountCount).toBe(1);
  });

  it("moves a multi-selected task drag to Anytime", async () => {
    const tasksContext = await import("../../context/TasksContext");
    const updateTask = vi.fn();

    vi.mocked(tasksContext.useTasks).mockReturnValue(
      makeTasksHookValue({
        tasks: [
          {
            id: "task-1",
            title: "One",
            description: "",
            link: "",
            waitingFor: "",
            createdAt: "2026-04-10T10:00:00Z",
            actionAt: null,
            scheduleBucket: null,
            completedAt: null,
            starred: false,
            dueAt: null,
            recurrence: null,
          },
          {
            id: "task-2",
            title: "Two",
            description: "",
            link: "",
            waitingFor: "",
            createdAt: "2026-04-10T11:00:00Z",
            actionAt: null,
            scheduleBucket: null,
            completedAt: null,
            starred: false,
            dueAt: null,
            recurrence: null,
          },
        ],
        updateTask,
      }),
    );

    render(<WorkspaceNavigation paneMode={3} workspaceMode="tasks" />);

    await act(async () => {
      await (latestDndProps?.onDragEnd as ((event: unknown) => Promise<void>))?.({
        active: {
          data: {
            current: {
              type: "task",
              id: "task-1",
              ids: ["task-1", "task-2"],
            },
          },
        },
        over: {
          data: {
            current: {
              type: "task-view-drop-target",
              view: "anytime",
            },
          },
        },
      });
    });

    expect(updateTask).toHaveBeenCalledTimes(2);
    expect(updateTask).toHaveBeenCalledWith("task-1", {
      actionAt: null,
      scheduleBucket: "anytime",
    });
    expect(updateTask).toHaveBeenCalledWith("task-2", {
      actionAt: null,
      scheduleBucket: "anytime",
    });
  });

  it("reopens completed tasks before dropping them into an active horizon", async () => {
    const tasksContext = await import("../../context/TasksContext");
    const updateTask = vi.fn();
    const setCompleted = vi.fn();

    vi.mocked(tasksContext.useTasks).mockReturnValue(
      makeTasksHookValue({
        today: "2026-04-11",
        tasks: [
          {
            id: "task-1",
            title: "Done",
            description: "",
            link: "",
            waitingFor: "",
            createdAt: "2026-04-10T10:00:00Z",
            actionAt: null,
            scheduleBucket: null,
            completedAt: "2026-04-11T08:00:00Z",
            starred: false,
            dueAt: null,
            recurrence: null,
          },
        ],
        updateTask,
        setCompleted,
      }),
    );

    render(<WorkspaceNavigation paneMode={3} workspaceMode="tasks" />);

    await act(async () => {
      await (latestDndProps?.onDragEnd as ((event: unknown) => Promise<void>))?.({
        active: {
          data: {
            current: {
              type: "task",
              id: "task-1",
            },
          },
        },
        over: {
          data: {
            current: {
              type: "task-view-drop-target",
              view: "today",
            },
          },
        },
      });
    });

    expect(setCompleted).toHaveBeenCalledWith("task-1", false);
    expect(updateTask).toHaveBeenCalledWith("task-1", {
      actionAt: localDateToNormalizedActionAt("2026-04-11"),
      scheduleBucket: null,
    });
  });
});

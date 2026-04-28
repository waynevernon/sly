import { act, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as tasksService from "../services/tasksService";
import { TasksProvider, useTasks } from "./TasksContext";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

vi.mock("../services/tasksService", () => ({
  listTasks: vi.fn(),
  readTask: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  setTaskCompleted: vi.fn(),
  deleteTask: vi.fn(),
  getTaskViewOrder: vi.fn(),
  setTaskViewOrder: vi.fn(),
}));

vi.mock("./NotesContext", () => ({
  useNotesData: () => ({
    notesFolder: "/notes",
    settings: {
      schemaVersion: 1,
      showNoteCounts: true,
      showNotesFromSubfolders: false,
      noteListDateMode: "modified",
      showNoteListFilename: true,
      showNoteListFolderPath: false,
      showNoteListPreview: true,
      noteListPreviewLines: 2,
      noteSortMode: "modifiedDesc",
      folderSortMode: "nameAsc",
      tasksEnabled: true,
    },
  }),
}));

function Wrapper({ children }: PropsWithChildren) {
  return <TasksProvider>{children}</TasksProvider>;
}

describe("TasksContext", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-09T23:59:58"));
    vi.mocked(tasksService.listTasks).mockResolvedValue([]);
    vi.mocked(tasksService.getTaskViewOrder).mockResolvedValue([]);
  });

  it("updates the derived local date after midnight while the app remains open", async () => {
    const { result } = renderHook(() => useTasks(), { wrapper: Wrapper });

    expect(result.current.today).toBe("2026-04-09");

    vi.setSystemTime(new Date("2026-04-10T00:00:01"));

    await act(async () => {
      vi.advanceTimersByTime(3_000);
    });

    expect(result.current.today).toBe("2026-04-10");
  });
});

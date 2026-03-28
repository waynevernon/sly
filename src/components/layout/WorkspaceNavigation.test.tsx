import { act, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceNavigation } from "./WorkspaceNavigation";

let latestDndProps: Record<string, unknown> | null = null;

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

vi.mock("../../context/ThemeContext", () => ({
  useTheme: vi.fn(),
}));

vi.mock("./FoldersPane", () => ({
  FoldersPane: () => <div data-testid="folders-pane" />,
}));

vi.mock("./NotesPane", () => ({
  NotesPane: () => <div data-testid="notes-pane" />,
}));

type NotesHookValue = ReturnType<
  typeof import("../../context/NotesContext").useNotes
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

describe("WorkspaceNavigation", () => {
  beforeEach(async () => {
    latestDndProps = null;

    const notesContext = await import("../../context/NotesContext");
    vi.mocked(notesContext.useNotes).mockReturnValue(makeNotesHookValue());

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

    render(<WorkspaceNavigation paneMode={3} />);

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

  it("moves folders to root when dropped on All Notes", async () => {
    const notesContext = await import("../../context/NotesContext");
    const moveFolder = vi.fn();

    vi.mocked(notesContext.useNotes).mockReturnValue(
      makeNotesHookValue({ moveFolder }),
    );

    render(<WorkspaceNavigation paneMode={3} />);

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

    render(<WorkspaceNavigation paneMode={3} />);

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
});

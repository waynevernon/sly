import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FolderTreeView } from "./FolderTreeView";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

vi.mock("@dnd-kit/core", () => ({
  useDndContext: vi.fn(() => ({ active: null, over: null })),
  useDraggable: vi.fn(() => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    isDragging: false,
  })),
  useDroppable: vi.fn(() => ({
    setNodeRef: vi.fn(),
    isOver: false,
  })),
}));

vi.mock("../../context/NotesContext", () => ({
  useNotes: vi.fn(),
}));

vi.mock("../../context/ThemeContext", () => ({
  useTheme: vi.fn(() => ({
    confirmDeletions: true,
    resolvedTheme: "light",
    setConfirmDeletions: vi.fn(),
  })),
}));

vi.mock("../../services/notes", () => ({
  listFolders: vi.fn(async () => []),
}));

type NotesHookValue = ReturnType<
  typeof import("../../context/NotesContext").useNotes
>;

function makeNotesHookValue(
  overrides: Partial<NotesHookValue> = {},
): NotesHookValue {
  return {
    notes: [],
    recentNotes: [],
    notesFolder: "/notes",
    settings: {},
    folderAppearances: {},
    folderSortMode: "nameAsc",
    folderManualOrder: {},
    showRecentNotes: true,
    selectedScope: { type: "all" },
    selectedFolderPath: null,
    selectFolder: vi.fn(),
    selectRecentNotes: vi.fn(),
    setShowRecentNotes: vi.fn(),
    createNoteInFolder: vi.fn(),
    createFolder: vi.fn(),
    deleteFolder: vi.fn(),
    renameFolder: vi.fn(),
    moveFolder: vi.fn(),
    setFolderAppearance: vi.fn(),
    setCollapsedFolders: vi.fn(),
    ...overrides,
  } as never;
}

describe("FolderTreeView", () => {
  beforeEach(async () => {
    const notesContext = await import("../../context/NotesContext");
    vi.mocked(notesContext.useNotes).mockReturnValue(makeNotesHookValue());
  });

  it("renders Recent Notes above All Notes and selects it via the dedicated action", async () => {
    const user = userEvent.setup();
    const notesContext = await import("../../context/NotesContext");
    const selectRecentNotes = vi.fn();

    vi.mocked(notesContext.useNotes).mockReturnValue(
      makeNotesHookValue({
        recentNotes: [
          {
            id: "alpha",
            title: "Alpha",
            preview: "preview",
            modified: 1,
            created: 1,
          },
          {
            id: "beta",
            title: "Beta",
            preview: "preview",
            modified: 2,
            created: 2,
          },
        ],
        selectRecentNotes,
      }),
    );

    render(<FolderTreeView dragDelta={null} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Recent Notes/i })).toBeInTheDocument();
    });

    const recentButton = screen.getByRole("button", { name: /Recent Notes/i });
    const allNotesButton = screen.getByRole("button", { name: /All Notes/i });

    expect(
      recentButton.compareDocumentPosition(allNotesButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    await user.click(recentButton);

    expect(selectRecentNotes).toHaveBeenCalledTimes(1);
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("applies selected styling to the active virtual scope", async () => {
    const notesContext = await import("../../context/NotesContext");

    vi.mocked(notesContext.useNotes).mockReturnValue(
      makeNotesHookValue({
        selectedScope: { type: "recent" },
      }),
    );

    const { rerender } = render(<FolderTreeView dragDelta={null} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Recent Notes/i })).toBeInTheDocument();
    });

    expect(
      screen.getByRole("button", { name: /Recent Notes/i }).className,
    ).toMatch(/(^|\s)bg-bg-muted($|\s)/);

    vi.mocked(notesContext.useNotes).mockReturnValue(
      makeNotesHookValue({
        selectedScope: { type: "all" },
      }),
    );

    rerender(<FolderTreeView dragDelta={null} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /All Notes/i })).toBeInTheDocument();
    });

    expect(
      screen.getByRole("button", { name: /Recent Notes/i }).className,
    ).not.toMatch(/(^|\s)bg-bg-muted($|\s)/);
    expect(
      screen.getByRole("button", { name: /All Notes/i }).parentElement?.className,
    ).toContain("bg-bg-muted");
  });

  it("hides the recent notes row when the setting is disabled", async () => {
    const notesContext = await import("../../context/NotesContext");

    vi.mocked(notesContext.useNotes).mockReturnValue(
      makeNotesHookValue({
        showRecentNotes: false,
      }),
    );

    render(<FolderTreeView dragDelta={null} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /All Notes/i })).toBeInTheDocument();
    });

    expect(
      screen.queryByRole("button", { name: /Recent Notes/i }),
    ).not.toBeInTheDocument();
  });
});

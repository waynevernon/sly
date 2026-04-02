import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Settings } from "../../types/note";
import { FolderTreeView } from "./FolderTreeView";

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

type NotesHookValue = ReturnType<
  typeof import("../../context/NotesContext").useNotes
>;

function makeNotesHookValue(
  overrides: Partial<NotesHookValue> = {},
): NotesHookValue {
  const settings: Settings = {
    schemaVersion: 1,
    showNoteCounts: true,
    showNotesFromSubfolders: false,
    noteListDateMode: "modified",
    showNoteListFilename: false,
    showNoteListFolderPath: true,
    showNoteListPreview: true,
    noteListPreviewLines: 2,
    noteSortMode: "modifiedDesc",
    folderSortMode: "nameAsc",
  };

  return {
    notes: [],
    pinnedNotes: [],
    recentNotes: [],
    knownFolders: [],
    hasLoadedFolders: true,
    notesFolder: "/notes",
    settings,
    folderAppearances: {},
    folderSortMode: "nameAsc",
    folderRevealRequest: null,
    showPinnedNotes: true,
    showRecentNotes: true,
    showNoteCounts: true,
    showNotesFromSubfolders: false,
    selectedScope: { type: "all" },
    selectedFolderPath: null,
    selectFolder: vi.fn(),
    selectPinnedNotes: vi.fn(),
    selectRecentNotes: vi.fn(),
    revealFolder: vi.fn(),
    setShowRecentNotes: vi.fn(),
    createNote: vi.fn(),
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

  it("renders Pinned and Recent above Notes and selects them via dedicated actions", async () => {
    const user = userEvent.setup();
    const notesContext = await import("../../context/NotesContext");
    const selectPinnedNotes = vi.fn();
    const selectRecentNotes = vi.fn();

    vi.mocked(notesContext.useNotes).mockReturnValue(
      makeNotesHookValue({
        pinnedNotes: [
          {
            id: "pinned/alpha",
            title: "Pinned alpha",
            preview: "preview",
            modified: 3,
            created: 3,
          },
        ],
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
        selectPinnedNotes,
        selectRecentNotes,
      }),
    );

    render(<FolderTreeView />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Pinned/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Recent/i })).toBeInTheDocument();
    });

    const pinnedButton = screen.getByRole("button", { name: /Pinned/i });
    const recentButton = screen.getByRole("button", { name: /Recent/i });
    const allNotesButton = screen.getByRole("button", {
      name: /^Notes(?: \d+)?$/i,
    });

    expect(
      pinnedButton.compareDocumentPosition(recentButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      recentButton.compareDocumentPosition(allNotesButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    await user.click(pinnedButton);
    await user.click(recentButton);

    expect(selectPinnedNotes).toHaveBeenCalledTimes(1);
    expect(selectRecentNotes).toHaveBeenCalledTimes(1);
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("applies selected styling to the active virtual scope", async () => {
    const notesContext = await import("../../context/NotesContext");

    vi.mocked(notesContext.useNotes).mockReturnValue(
      makeNotesHookValue({
        selectedScope: { type: "pinned" },
      }),
    );

    const { rerender } = render(<FolderTreeView />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Pinned/i })).toBeInTheDocument();
    });

    expect(
      screen.getByRole("button", { name: /Pinned/i }).className,
    ).toMatch(/(^|\s)bg-bg-muted($|\s)/);

    vi.mocked(notesContext.useNotes).mockReturnValue(
      makeNotesHookValue({
        selectedScope: { type: "all" },
      }),
    );

    rerender(<FolderTreeView />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /^Notes(?: \d+)?$/i }),
      ).toBeInTheDocument();
    });

    expect(
      screen.getByRole("button", { name: /Pinned/i }).className,
    ).not.toMatch(/(^|\s)bg-bg-muted($|\s)/);
    expect(
      screen.getByRole("button", { name: /^Notes(?: \d+)?$/i }).parentElement
        ?.className,
    ).toContain("bg-bg-muted");
  });

  it("hides the pinned notes row when the setting is disabled", async () => {
    const notesContext = await import("../../context/NotesContext");

    vi.mocked(notesContext.useNotes).mockReturnValue(
      makeNotesHookValue({
        showPinnedNotes: false,
      }),
    );

    render(<FolderTreeView />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /^Notes(?: \d+)?$/i }),
      ).toBeInTheDocument();
    });

    expect(
      screen.queryByRole("button", { name: /Pinned/i }),
    ).not.toBeInTheDocument();
  });

  it("hides the recent notes row when the setting is disabled", async () => {
    const notesContext = await import("../../context/NotesContext");

    vi.mocked(notesContext.useNotes).mockReturnValue(
      makeNotesHookValue({
        showRecentNotes: false,
      }),
    );

    render(<FolderTreeView />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /^Notes(?: \d+)?$/i }),
      ).toBeInTheDocument();
    });

    expect(
      screen.queryByRole("button", { name: /Recent/i }),
    ).not.toBeInTheDocument();
  });

  it("hides folder note counts when the setting is disabled", async () => {
    const notesContext = await import("../../context/NotesContext");

    vi.mocked(notesContext.useNotes).mockReturnValue(
      makeNotesHookValue({
        notes: [
          {
            id: "alpha",
            title: "Alpha",
            preview: "preview",
            modified: 1,
            created: 1,
          },
        ],
        recentNotes: [
          {
            id: "beta",
            title: "Beta",
            preview: "preview",
            modified: 2,
            created: 2,
          },
          {
            id: "gamma",
            title: "Gamma",
            preview: "preview",
            modified: 3,
            created: 3,
          },
        ],
        showNoteCounts: false,
      }),
    );

    render(<FolderTreeView />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /^Notes(?: \d+)?$/i }),
      ).toBeInTheDocument();
    });

    expect(screen.queryByText("1")).not.toBeInTheDocument();
    expect(screen.queryByText("2")).not.toBeInTheDocument();
  });

  it("opens root folder creation from the Notes context menu", async () => {
    const user = userEvent.setup();

    render(<FolderTreeView />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /^Notes(?: \d+)?$/i }),
      ).toBeInTheDocument();
    });

    fireEvent.contextMenu(
      screen.getByRole("button", { name: /^Notes(?: \d+)?$/i }),
    );

    expect(screen.queryByRole("separator")).not.toBeInTheDocument();

    await user.click(screen.getByRole("menuitem", { name: /New Subfolder/i }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Folder name")).toBeInTheDocument();
    });
  });

  it("creates a root note from the Notes context menu", async () => {
    const notesContext = await import("../../context/NotesContext");
    const user = userEvent.setup();
    const createNote = vi.fn();

    vi.mocked(notesContext.useNotes).mockReturnValue(
      makeNotesHookValue({
        createNote,
      }),
    );

    render(<FolderTreeView />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /^Notes(?: \d+)?$/i }),
      ).toBeInTheDocument();
    });

    fireEvent.contextMenu(
      screen.getByRole("button", { name: /^Notes(?: \d+)?$/i }),
    );

    await user.click(screen.getByRole("menuitem", { name: /^New Note$/i }));

    expect(createNote).toHaveBeenCalledTimes(1);
  });

  it("does not briefly expand a collapsed folder while renaming it", async () => {
    const notesContext = await import("../../context/NotesContext");
    const user = userEvent.setup();

    vi.mocked(notesContext.useNotes).mockImplementation(() => {
      const [selectedFolderPath, setSelectedFolderPath] = useState<string | null>(
        "docs",
      );
      const [knownFolders, setKnownFolders] = useState(["docs", "docs/reference"]);
      const [settings, setSettings] = useState<Settings>({
        schemaVersion: 1,
        showNoteCounts: true,
        showNotesFromSubfolders: false,
        noteListDateMode: "modified",
        showNoteListFilename: false,
        showNoteListFolderPath: true,
        showNoteListPreview: true,
        noteListPreviewLines: 2,
        noteSortMode: "modifiedDesc",
        folderSortMode: "nameAsc",
        collapsedFolders: ["docs"],
      });

      const renameFolder = vi.fn().mockImplementation(async () => {
        setKnownFolders(["archive", "archive/reference"]);
        setSettings((current) => ({ ...current, collapsedFolders: ["archive"] }));
        setSelectedFolderPath("archive");
      });

      return makeNotesHookValue({
        settings,
        knownFolders,
        selectedScope: selectedFolderPath
          ? { type: "folder", path: selectedFolderPath }
          : { type: "all" },
        selectedFolderPath,
        selectFolder: setSelectedFolderPath,
        renameFolder,
      });
    });

    render(<FolderTreeView />);

    await waitFor(() => {
      expect(screen.getByText("docs")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Expand folder/i }),
      ).toBeInTheDocument();
    });

    const expandedChildSeen: boolean[] = [];
    const observer = new MutationObserver(() => {
      if (screen.queryByText("reference")) {
        expandedChildSeen.push(true);
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    const docsRow = screen.getByText("docs").closest('[data-folder-path="docs"]');
    expect(docsRow).not.toBeNull();

    fireEvent.contextMenu(docsRow!);
    await user.click(screen.getByRole("menuitem", { name: /Rename/i }));

    const input = screen.getByDisplayValue("docs");
    await user.clear(input);
    await user.type(input, "archive{enter}");

    await waitFor(() => {
      expect(screen.getByText("archive")).toBeInTheDocument();
    });

    observer.disconnect();

    expect(expandedChildSeen).toHaveLength(0);
    expect(screen.queryByText("reference")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Expand folder/i })).toBeInTheDocument();
  });

  it("shows only direct folder note counts and hides zero-count folder badges", async () => {
    const notesContext = await import("../../context/NotesContext");
    const user = userEvent.setup();

    vi.mocked(notesContext.useNotes).mockReturnValue(
      makeNotesHookValue({
        knownFolders: [
          "docs",
          "docs/reference",
          "empty",
        ],
        notes: [
          {
            id: "docs/alpha",
            title: "Alpha",
            preview: "preview",
            modified: 1,
            created: 1,
          },
          {
            id: "docs/reference/beta",
            title: "Beta",
            preview: "preview",
            modified: 2,
            created: 2,
          },
        ],
      }),
    );

    render(<FolderTreeView />);

    await waitFor(() => {
      expect(screen.getByText("docs")).toBeInTheDocument();
      expect(screen.getByText("empty")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Expand folder/i }));

    await waitFor(() => {
      expect(screen.getByText("reference")).toBeInTheDocument();
    });

    const docsRow = screen.getByText("docs").closest('[data-folder-path="docs"]');
    const referenceRow = screen
      .getByText("reference")
      .closest('[data-folder-path="docs/reference"]');
    const emptyRow = screen.getByText("empty").closest('[data-folder-path="empty"]');

    expect(docsRow?.querySelector(".ui-count-badge")).toHaveTextContent("1");
    expect(referenceRow?.querySelector(".ui-count-badge")).toHaveTextContent("1");
    expect(emptyRow?.querySelector(".ui-count-badge")).toBeNull();
  });

  it("selects a folder when clicking its count badge area", async () => {
    const notesContext = await import("../../context/NotesContext");
    const user = userEvent.setup();
    const selectFolder = vi.fn();

    vi.mocked(notesContext.useNotes).mockReturnValue(
      makeNotesHookValue({
        knownFolders: ["docs"],
        notes: [
          {
            id: "docs/alpha",
            title: "Alpha",
            preview: "preview",
            modified: 1,
            created: 1,
          },
        ],
        selectFolder,
      }),
    );

    render(<FolderTreeView />);

    await waitFor(() => {
      expect(screen.getByText("docs")).toBeInTheDocument();
    });

    const docsRow = screen.getByText("docs").closest('[data-folder-path="docs"]');
    const countBadge = docsRow?.querySelector(".ui-count-badge");

    expect(countBadge).not.toBeNull();

    await user.click(countBadge as HTMLElement);

    expect(selectFolder).toHaveBeenCalledWith("docs");
  });

  it("selects a folder when clicking the row outside the label", async () => {
    const notesContext = await import("../../context/NotesContext");
    const user = userEvent.setup();
    const selectFolder = vi.fn();

    vi.mocked(notesContext.useNotes).mockReturnValue(
      makeNotesHookValue({
        knownFolders: ["docs"],
        selectFolder,
      }),
    );

    render(<FolderTreeView />);

    await waitFor(() => {
      expect(screen.getByText("docs")).toBeInTheDocument();
    });

    const row = document.querySelector('[data-folder-row-select="docs"]');

    expect(row).not.toBeNull();

    await user.click(row as HTMLElement);

    expect(selectFolder).toHaveBeenCalledWith("docs");
  });

  it("shows recursive folder note counts when enabled and still hides zero-count badges", async () => {
    const notesContext = await import("../../context/NotesContext");
    const user = userEvent.setup();

    vi.mocked(notesContext.useNotes).mockReturnValue(
      makeNotesHookValue({
        knownFolders: [
          "docs",
          "docs/reference",
          "empty",
        ],
        notes: [
          {
            id: "docs/alpha",
            title: "Alpha",
            preview: "preview",
            modified: 1,
            created: 1,
          },
          {
            id: "docs/reference/beta",
            title: "Beta",
            preview: "preview",
            modified: 2,
            created: 2,
          },
        ],
        showNotesFromSubfolders: true,
      }),
    );

    render(<FolderTreeView />);

    await waitFor(() => {
      expect(screen.getByText("docs")).toBeInTheDocument();
      expect(screen.getByText("empty")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Expand folder/i }));

    await waitFor(() => {
      expect(screen.getByText("reference")).toBeInTheDocument();
    });

    const docsRow = screen.getByText("docs").closest('[data-folder-path="docs"]');
    const referenceRow = screen
      .getByText("reference")
      .closest('[data-folder-path="docs/reference"]');
    const emptyRow = screen.getByText("empty").closest('[data-folder-path="empty"]');

    expect(docsRow?.querySelector(".ui-count-badge")).toHaveTextContent("2");
    expect(referenceRow?.querySelector(".ui-count-badge")).toHaveTextContent("1");
    expect(emptyRow?.querySelector(".ui-count-badge")).toBeNull();
  });

  it("uses active and inactive badge emphasis for selected and unselected counts", async () => {
    const notesContext = await import("../../context/NotesContext");

    vi.mocked(notesContext.useNotes).mockReturnValue(
      makeNotesHookValue({
        notes: [
          {
            id: "alpha",
            title: "Alpha",
            preview: "preview",
            modified: 1,
            created: 1,
          },
        ],
        recentNotes: [
          {
            id: "alpha",
            title: "Alpha",
            preview: "preview",
            modified: 1,
            created: 1,
          },
        ],
        selectedScope: { type: "recent" },
      }),
    );

    render(<FolderTreeView />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Recent/i })).toBeInTheDocument();
    });

    const recentButton = screen.getByRole("button", { name: /Recent/i });
    const allNotesButton = screen.getByRole("button", {
      name: /^Notes(?: \d+)?$/i,
    });
    const recentBadge = recentButton.querySelector(".ui-count-badge");
    const allNotesBadge = allNotesButton.querySelector(".ui-count-badge");

    expect(recentBadge?.className).toMatch(/ui-count-badge--active/);
    expect(recentBadge?.className).toMatch(/ui-count-badge--plain/);
    expect(allNotesBadge?.className).toMatch(/ui-count-badge--inactive/);
    expect(allNotesBadge?.className).toMatch(/ui-count-badge--plain/);
  });

  it("keeps the dragged folder dimmed while a move is pending", async () => {
    const notesContext = await import("../../context/NotesContext");

    vi.mocked(notesContext.useNotes).mockReturnValue(
      makeNotesHookValue({
        knownFolders: ["docs"],
      }),
    );

    render(<FolderTreeView pendingFolderPath="docs" />);

    await waitFor(() => {
      expect(screen.getByText("docs")).toBeInTheDocument();
    });

    const docsRow = screen.getByText("docs").closest('[data-folder-path="docs"]');
    expect(docsRow?.firstElementChild).toHaveClass("opacity-40");
  });
});

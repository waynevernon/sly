import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "../ui";
import { FoldersPane } from "./FoldersPane";

vi.mock("../../context/NotesContext", () => ({
  useNotes: vi.fn(),
}));

vi.mock("../notes/FolderTreeView", () => ({
  FolderTreeView: () => <div data-testid="folder-tree-view" />,
}));

vi.mock("./Footer", () => ({
  Footer: () => <div data-testid="folders-footer" />,
}));

type NotesHookValue = ReturnType<
  typeof import("../../context/NotesContext").useNotes
>;

function makeNotesHookValue(
  overrides: Partial<NotesHookValue> = {},
): NotesHookValue {
  return {
    folderSortMode: "nameAsc",
    showPinnedNotes: true,
    showRecentNotes: true,
    showNoteCounts: true,
    setFolderSortMode: vi.fn(),
    setNoteListViewOptions: vi.fn(),
    setShowPinnedNotes: vi.fn(),
    setShowRecentNotes: vi.fn(),
    ...overrides,
  } as never;
}

describe("FoldersPane", () => {
  beforeEach(async () => {
    const notesContext = await import("../../context/NotesContext");
    vi.mocked(notesContext.useNotes).mockReturnValue(makeNotesHookValue());
  });

  it("shows the pinned, recent, and note count toggles in the filter menu", async () => {
    const user = userEvent.setup();
    const notesContext = await import("../../context/NotesContext");
    const setShowPinnedNotes = vi.fn();
    const setShowRecentNotes = vi.fn();
    const setNoteListViewOptions = vi.fn();

    vi.mocked(notesContext.useNotes).mockReturnValue(
      makeNotesHookValue({
        setShowPinnedNotes,
        setShowRecentNotes,
        setNoteListViewOptions,
      }),
    );

    render(
      <TooltipProvider>
        <FoldersPane />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Folder view options" }));

    expect(screen.getByText("Sections")).toBeInTheDocument();
    expect(screen.queryByRole("menuitemradio", { name: /Manual/i })).not.toBeInTheDocument();

    const pinnedToggle = screen.getByRole("menuitemcheckbox", {
      name: /Pinned/i,
    });
    expect(pinnedToggle).toHaveAttribute("data-state", "checked");

    await user.click(pinnedToggle);
    await user.click(screen.getByRole("button", { name: "Folder view options" }));

    const toggle = screen.getByRole("menuitemcheckbox", {
      name: /Recent/i,
    });
    expect(toggle).toHaveAttribute("data-state", "checked");

    await user.click(toggle);
    await user.click(screen.getByRole("button", { name: "Folder view options" }));
    await user.click(screen.getByRole("menuitemcheckbox", { name: /Note Count/i }));

    expect(setShowPinnedNotes).toHaveBeenCalledWith(false);
    expect(setShowRecentNotes).toHaveBeenCalledWith(false);
    expect(setNoteListViewOptions).toHaveBeenCalledWith({
      showNoteCounts: false,
    });
  }, 10000);
});

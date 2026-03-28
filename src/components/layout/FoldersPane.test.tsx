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
    showRecentNotes: true,
    showNoteCounts: true,
    setFolderSortMode: vi.fn(),
    setNoteListViewOptions: vi.fn(),
    setShowRecentNotes: vi.fn(),
    ...overrides,
  } as never;
}

describe("FoldersPane", () => {
  beforeEach(async () => {
    const notesContext = await import("../../context/NotesContext");
    vi.mocked(notesContext.useNotes).mockReturnValue(makeNotesHookValue());
  });

  it("shows the recent notes and note count toggles in the folders view menu", async () => {
    const user = userEvent.setup();
    const notesContext = await import("../../context/NotesContext");
    const setShowRecentNotes = vi.fn();
    const setNoteListViewOptions = vi.fn();

    vi.mocked(notesContext.useNotes).mockReturnValue(
      makeNotesHookValue({ setShowRecentNotes, setNoteListViewOptions }),
    );

    render(
      <TooltipProvider>
        <FoldersPane
          dragDelta={null}
          onManualFolderDropPlanChange={vi.fn()}
          pendingManualFolderDropPlan={null}
        />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Sort Folders" }));

    expect(screen.getByText("View")).toBeInTheDocument();

    const toggle = screen.getByRole("menuitemcheckbox", {
      name: /Recent Notes/i,
    });
    expect(toggle).toHaveAttribute("data-state", "checked");

    await user.click(toggle);
    await user.click(screen.getByRole("button", { name: "Sort Folders" }));
    await user.click(screen.getByRole("menuitemcheckbox", { name: /Note Count/i }));

    expect(setShowRecentNotes).toHaveBeenCalledWith(false);
    expect(setNoteListViewOptions).toHaveBeenCalledWith({
      showNoteCounts: false,
    });
  });
});

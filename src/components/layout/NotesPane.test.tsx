import userEvent from "@testing-library/user-event";
import {
  act,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchResult } from "../../services/notes";
import type { NoteListEmptyState } from "../notes/NoteList";
import { TooltipProvider } from "../ui";
import { NotesPane } from "./NotesPane";

const noteListSpy = vi.fn();

vi.mock("../../context/NotesContext", () => ({
  useNotes: vi.fn(),
}));

vi.mock("../../context/ThemeContext", () => ({
  useTheme: vi.fn(() => ({
    resolvedTheme: "light",
  })),
}));

vi.mock("../notes/NoteList", () => ({
  NoteList: ({
    items,
    emptyState,
  }: {
    items: Array<{ id: string; title: string; created: number }>;
    emptyState: NoteListEmptyState;
  }) => {
    noteListSpy({ items, emptyState });
    return (
      <div>
        <div data-testid="empty-title">{emptyState.title}</div>
        <div data-testid="empty-message">{emptyState.message}</div>
        <div data-testid="empty-kind">{emptyState.kind}</div>
        <div data-testid="note-items">{JSON.stringify(items)}</div>
        <ul>
          {items.map((item) => (
            <li key={item.id}>{item.title}</li>
          ))}
        </ul>
      </div>
    );
  },
}));

type NotesHookValue = ReturnType<
  typeof import("../../context/NotesContext").useNotes
>;

function makeNotesHookValue(
  overrides: Partial<NotesHookValue> = {},
): NotesHookValue {
  return {
    notesFolder: "/notes",
    notes: [
      {
        id: "alpha",
        title: "Alpha note",
        preview: "planning",
        modified: 2,
        created: 2,
      },
    ],
    scopedNotes: [
      {
        id: "alpha",
        title: "Alpha note",
        preview: "planning",
        modified: 2,
        created: 2,
      },
    ],
    recentNotes: [
      {
        id: "alpha",
        title: "Alpha note",
        preview: "planning",
        modified: 2,
        created: 2,
      },
    ],
    folderAppearances: {},
    noteSortMode: "modifiedDesc",
    noteListDateMode: "modified",
    noteListPreviewLines: 2,
    showNoteCounts: true,
    showNotesFromSubfolders: false,
    showNoteListFilename: true,
    showNoteListFolderPath: false,
    showNoteListPreview: true,
    showRecentNotes: true,
    selectedScope: { type: "all" },
    selectedFolderPath: null,
    selectedNoteIds: [],
    createNote: vi.fn(),
    search: vi.fn(),
    searchQuery: "",
    searchResults: [] as SearchResult[],
    clearSearch: vi.fn(),
    setNoteSortMode: vi.fn(),
    setNoteListViewOptions: vi.fn(),
    ...overrides,
  } as never;
}

describe("NotesPane", () => {
  beforeEach(async () => {
    noteListSpy.mockClear();
    const notesContext = await import("../../context/NotesContext");
    vi.mocked(notesContext.useNotes).mockReturnValue(makeNotesHookValue());
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("debounces search input before querying notes", async () => {
    vi.useFakeTimers();
    const notesContext = await import("../../context/NotesContext");
    const search = vi.fn();
    vi.mocked(notesContext.useNotes).mockReturnValue(
      makeNotesHookValue({ search }),
    );

    render(
      <TooltipProvider>
        <NotesPane />
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Search notes" }));
    const input = screen.getByPlaceholderText("Search notes...");

    fireEvent.change(input, { target: { value: "alp" } });

    expect(search).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(220);
    });

    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith("alp");
  });

  it("renders mapped search results when search is active", async () => {
    const notesContext = await import("../../context/NotesContext");
    vi.mocked(notesContext.useNotes).mockReturnValue(
      makeNotesHookValue({
        searchQuery: "alp",
        searchResults: [
          {
            id: "alpha",
            title: "Alpha remote",
            preview: "fresh",
            modified: 6,
            score: 10,
          },
        ],
      }),
    );

    render(
      <TooltipProvider>
        <NotesPane />
      </TooltipProvider>,
    );

    expect(screen.getByText("Search Results")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("Alpha remote")).toBeInTheDocument();
    expect(screen.getByTestId("note-items")).toHaveTextContent('"created":2');
    expect(screen.getByTestId("empty-title")).toHaveTextContent("No results");
    expect(screen.getByTestId("empty-message")).toHaveTextContent(
      "No notes matched your search.",
    );
    expect(screen.getByTestId("empty-kind")).toHaveTextContent("search");
  });

  it("falls back to modified time for created timestamps missing from notes cache", async () => {
    const notesContext = await import("../../context/NotesContext");
    vi.mocked(notesContext.useNotes).mockReturnValue(
      makeNotesHookValue({
        notes: [],
        searchQuery: "alp",
        searchResults: [
          {
            id: "alpha",
            title: "Alpha remote",
            preview: "fresh",
            modified: 6,
            score: 10,
          },
        ],
      }),
    );

    render(
      <TooltipProvider>
        <NotesPane />
      </TooltipProvider>,
    );

    expect(screen.getByTestId("note-items")).toHaveTextContent('"created":6');
  });

  it("renders the recent notes heading and items", async () => {
    const notesContext = await import("../../context/NotesContext");
    vi.mocked(notesContext.useNotes).mockReturnValue(
      makeNotesHookValue({
        selectedScope: { type: "recent" },
        selectedFolderPath: null,
        scopedNotes: [
          {
            id: "work/alpha",
            title: "Alpha note",
            preview: "planning",
            modified: 2,
            created: 2,
          },
        ],
      }),
    );

    render(
      <TooltipProvider>
        <NotesPane />
      </TooltipProvider>,
    );

    expect(screen.getByText("Recent")).toBeInTheDocument();
    expect(screen.getByText("Alpha note")).toBeInTheDocument();
  });

  it("renders the pinned notes heading and items", async () => {
    const notesContext = await import("../../context/NotesContext");
    vi.mocked(notesContext.useNotes).mockReturnValue(
      makeNotesHookValue({
        selectedScope: { type: "pinned" },
        selectedFolderPath: null,
        scopedNotes: [
          {
            id: "work/alpha",
            title: "Alpha note",
            preview: "planning",
            modified: 2,
            created: 2,
          },
        ],
      }),
    );

    render(
      <TooltipProvider>
        <NotesPane />
      </TooltipProvider>,
    );

    expect(screen.getByText("Pinned")).toBeInTheDocument();
    expect(screen.getByText("Alpha note")).toBeInTheDocument();
  });

  it("shows the recent notes empty state", async () => {
    const notesContext = await import("../../context/NotesContext");
    vi.mocked(notesContext.useNotes).mockReturnValue(
      makeNotesHookValue({
        selectedScope: { type: "recent" },
        selectedFolderPath: null,
        scopedNotes: [],
      }),
    );

    render(
      <TooltipProvider>
        <NotesPane />
      </TooltipProvider>,
    );

    expect(screen.getByTestId("empty-title")).toHaveTextContent("No recent notes");
    expect(screen.getByTestId("empty-message")).toHaveTextContent(
      "Notes you open will appear here.",
    );
    expect(screen.getByTestId("empty-kind")).toHaveTextContent("recent");
  });

  it("shows the pinned notes empty state", async () => {
    const notesContext = await import("../../context/NotesContext");
    vi.mocked(notesContext.useNotes).mockReturnValue(
      makeNotesHookValue({
        selectedScope: { type: "pinned" },
        selectedFolderPath: null,
        scopedNotes: [],
      }),
    );

    render(
      <TooltipProvider>
        <NotesPane />
      </TooltipProvider>,
    );

    expect(screen.getByTestId("empty-title")).toHaveTextContent("No pinned notes");
    expect(screen.getByTestId("empty-message")).toHaveTextContent(
      "Pin notes to keep them here.",
    );
    expect(screen.getByTestId("empty-kind")).toHaveTextContent("pinned");
  });

  it("shows the view controls and routes note-list preference changes", async () => {
    const user = userEvent.setup();
    const notesContext = await import("../../context/NotesContext");
    const setNoteListViewOptions = vi.fn();
    vi.mocked(notesContext.useNotes).mockReturnValue(
      makeNotesHookValue({
        selectedScope: { type: "folder", path: "docs" },
        selectedFolderPath: "docs",
        setNoteListViewOptions,
      }),
    );

    render(
      <TooltipProvider>
        <NotesPane />
      </TooltipProvider>,
    );

    const sortButton = screen.getByRole("button", { name: "Note list options" });

    await user.click(sortButton);
    expect(screen.getByText("Sort This Folder")).toBeInTheDocument();
    expect(screen.getByText("View Options")).toBeInTheDocument();
    expect(screen.getByText("Date")).toBeInTheDocument();
    expect(screen.getByText("Modified")).toBeInTheDocument();
    expect(screen.getByText("2 Lines")).toBeInTheDocument();
    expect(screen.getByRole("menu").textContent).toMatch(
      /Notes From Subfolders.*Text Preview.*2 Lines.*Date.*Modified.*Folder Path.*Filename/s,
    );

    await user.click(
      screen.getByRole("menuitemcheckbox", { name: /Notes From Subfolders/i }),
    );
    await user.click(sortButton);
    await user.click(screen.getByRole("menuitemcheckbox", { name: /Folder Path/ }));

    expect(setNoteListViewOptions).toHaveBeenCalledWith({
      showNotesFromSubfolders: true,
    });
    expect(setNoteListViewOptions).toHaveBeenCalledWith({
      showNoteListFolderPath: true,
    });
  });

  it("shows the root notes view options for the Notes scope", async () => {
    const user = userEvent.setup();

    render(
      <TooltipProvider>
        <NotesPane />
      </TooltipProvider>,
    );

    await user.click(
      screen.getByRole("button", { name: "Note list options" }),
    );

    expect(screen.getByText("Sort Notes")).toBeInTheDocument();
    expect(
      screen.getByRole("menuitemcheckbox", { name: /Notes From Subfolders/i }),
    ).toBeInTheDocument();
  });

  it("uses the actual notes folder name for the root scope heading", async () => {
    const notesContext = await import("../../context/NotesContext");

    vi.mocked(notesContext.useNotes).mockReturnValue(
      makeNotesHookValue({
        notesFolder: "/Users/wayne/Documents/My Vault",
      }),
    );

    render(
      <TooltipProvider>
        <NotesPane />
      </TooltipProvider>,
    );

    expect(screen.getByText("My Vault")).toBeInTheDocument();
  });

  it("shows recent-note view options without folder or sort controls", async () => {
    const user = userEvent.setup();
    const notesContext = await import("../../context/NotesContext");
    vi.mocked(notesContext.useNotes).mockReturnValue(
      makeNotesHookValue({
        selectedScope: { type: "recent" },
        selectedFolderPath: null,
      }),
    );

    render(
      <TooltipProvider>
        <NotesPane />
      </TooltipProvider>,
    );

    await user.click(
      screen.getByRole("button", { name: "Note list options" }),
    );

    expect(screen.queryByText("Recent View")).not.toBeInTheDocument();
    expect(screen.getByText("View Options")).toBeInTheDocument();
    expect(screen.queryByText("Last Modified")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitemcheckbox", { name: /Notes From Subfolders/i }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("separator")).toHaveLength(1);
  });

  it("shows pinned-note view options with sort controls but no subfolder toggle", async () => {
    const user = userEvent.setup();
    const notesContext = await import("../../context/NotesContext");
    vi.mocked(notesContext.useNotes).mockReturnValue(
      makeNotesHookValue({
        selectedScope: { type: "pinned" },
        selectedFolderPath: null,
      }),
    );

    render(
      <TooltipProvider>
        <NotesPane />
      </TooltipProvider>,
    );

    await user.click(
      screen.getByRole("button", { name: "Note list options" }),
    );

    expect(screen.getByText("Sort Pinned")).toBeInTheDocument();
    expect(screen.getByText("Last Modified")).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitemcheckbox", { name: /Notes From Subfolders/i }),
    ).not.toBeInTheDocument();
  });

  it("hides the header note count when the setting is disabled", async () => {
    const notesContext = await import("../../context/NotesContext");
    vi.mocked(notesContext.useNotes).mockReturnValue(
      makeNotesHookValue({
        scopedNotes: [
          {
            id: "alpha",
            title: "Alpha note",
            preview: "planning",
            modified: 2,
            created: 2,
          },
          {
            id: "beta",
            title: "Beta note",
            preview: "shipping",
            modified: 1,
            created: 1,
          },
          {
            id: "gamma",
            title: "Gamma note",
            preview: "drafting",
            modified: 3,
            created: 3,
          },
        ],
        showNoteCounts: false,
      }),
    );

    render(
      <TooltipProvider>
        <NotesPane />
      </TooltipProvider>,
    );

    expect(screen.queryByText("3")).not.toBeInTheDocument();
  });

  it("renders the header note count with the inline plain active badge treatment", async () => {
    const { container } = render(
      <TooltipProvider>
        <NotesPane />
      </TooltipProvider>,
    );

    const badge = container.querySelector(".ui-count-badge");
    expect(badge).toHaveTextContent("1");
    expect(badge?.className).toMatch(/ui-count-badge--inline/);
    expect(badge?.className).toMatch(/ui-count-badge--plain/);
    expect(badge?.className).toMatch(/ui-count-badge--active/);
  });

  it("hides the header note count when the scoped note count is zero", async () => {
    const notesContext = await import("../../context/NotesContext");
    vi.mocked(notesContext.useNotes).mockReturnValue(
      makeNotesHookValue({
        scopedNotes: [],
        selectedScope: { type: "folder", path: "docs" },
        selectedFolderPath: "docs",
        showNoteCounts: true,
      }),
    );

    const { container } = render(
      <TooltipProvider>
        <NotesPane />
      </TooltipProvider>,
    );

    expect(container.querySelector(".ui-count-badge")).toBeNull();
  });

  it("shows the recursive folder empty state when enabled", async () => {
    const notesContext = await import("../../context/NotesContext");
    vi.mocked(notesContext.useNotes).mockReturnValue(
      makeNotesHookValue({
        scopedNotes: [],
        selectedScope: { type: "folder", path: "docs" },
        selectedFolderPath: "docs",
        showNotesFromSubfolders: true,
      }),
    );

    render(
      <TooltipProvider>
        <NotesPane />
      </TooltipProvider>,
    );

    expect(screen.getByTestId("empty-title")).toHaveTextContent("No notes here");
    expect(screen.getByTestId("empty-message")).toHaveTextContent(
      "No notes in this folder or its subfolders.",
    );
    expect(screen.getByTestId("empty-kind")).toHaveTextContent("notes");
  });

  it("shows the top-level root empty state when subfolders are hidden", async () => {
    const notesContext = await import("../../context/NotesContext");
    vi.mocked(notesContext.useNotes).mockReturnValue(
      makeNotesHookValue({
        scopedNotes: [],
        selectedScope: { type: "all" },
        selectedFolderPath: null,
        showNotesFromSubfolders: false,
      }),
    );

    render(
      <TooltipProvider>
        <NotesPane />
      </TooltipProvider>,
    );

    expect(screen.getByTestId("empty-title")).toHaveTextContent("No top-level notes");
    expect(screen.getByTestId("empty-message")).toHaveTextContent(
      "Create a note at the top level to get started.",
    );
    expect(screen.getByTestId("empty-kind")).toHaveTextContent("notes");
  });
});

import userEvent from "@testing-library/user-event";
import {
  act,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchResult } from "../../services/notes";
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
    emptyMessage,
    showFolderPrefix,
  }: {
    items: Array<{ id: string; title: string; created: number }>;
    emptyMessage: string;
    showFolderPrefix?: boolean;
  }) => {
    noteListSpy({ items, emptyMessage, showFolderPrefix });
    return (
      <div>
        <div data-testid="empty-message">{emptyMessage}</div>
        <div data-testid="show-folder-prefix">
          {showFolderPrefix ? "true" : "false"}
        </div>
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
    showNoteListFilename: false,
    showNoteListFolderPath: true,
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

    fireEvent.click(screen.getByRole("button", { name: "Search Notes" }));
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
    expect(screen.getByTestId("empty-message")).toHaveTextContent(
      "No results found",
    );
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

  it("renders the recent notes heading and keeps folder prefixes visible", async () => {
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

    expect(screen.getByText("Recent Notes")).toBeInTheDocument();
    expect(screen.getByText("Alpha note")).toBeInTheDocument();
    expect(screen.getByTestId("show-folder-prefix")).toHaveTextContent("true");
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

    expect(screen.getByTestId("empty-message")).toHaveTextContent(
      "No recent notes yet",
    );
  });

  it("shows the view controls and routes note-list preference changes", async () => {
    const user = userEvent.setup();
    const notesContext = await import("../../context/NotesContext");
    const setNoteListViewOptions = vi.fn();
    vi.mocked(notesContext.useNotes).mockReturnValue(
      makeNotesHookValue({
        setNoteListViewOptions,
      }),
    );

    render(
      <TooltipProvider>
        <NotesPane />
      </TooltipProvider>,
    );

    const sortButton = screen.getByRole("button", { name: "Sort Notes" });

    await user.click(sortButton);
    expect(screen.getByText("View")).toBeInTheDocument();
    expect(screen.getByText("Date")).toBeInTheDocument();
    expect(screen.getByText("Modified")).toBeInTheDocument();
    expect(screen.getByText("2 Lines")).toBeInTheDocument();
    expect(screen.getByRole("menu").textContent).toMatch(
      /Text Preview.*2 Lines.*Date.*Modified.*Folder Path.*Filename/s,
    );

    await user.click(screen.getByRole("menuitemcheckbox", { name: /Folder Path/ }));
    await user.click(sortButton);
    await user.click(screen.getByRole("menuitemcheckbox", { name: /Filename/ }));

    expect(setNoteListViewOptions).toHaveBeenCalledWith({
      showNoteListFolderPath: false,
    });
    expect(setNoteListViewOptions).toHaveBeenCalledWith({
      showNoteListFilename: true,
    });
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
});

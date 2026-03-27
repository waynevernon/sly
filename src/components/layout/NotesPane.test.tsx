import userEvent from "@testing-library/user-event";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchResult } from "../../services/notes";
import { NotesPane } from "./NotesPane";

const noteListSpy = vi.fn();

vi.mock("../../context/NotesContext", () => ({
  useNotes: vi.fn(),
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
    folderIcons: {},
    noteSortMode: "modifiedDesc",
    noteListDateMode: "modified",
    noteListPreviewLines: 2,
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
    const user = userEvent.setup({
      advanceTimers: vi.advanceTimersByTime,
    });

    const notesContext = await import("../../context/NotesContext");
    const search = vi.fn();
    vi.mocked(notesContext.useNotes).mockReturnValue(
      makeNotesHookValue({ search }),
    );

    render(<NotesPane />);

    await user.click(screen.getByRole("button", { name: "Search Notes" }));
    const input = screen.getByPlaceholderText("Search notes...");

    await user.type(input, "alp");

    expect(search).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(220);
    });

    await waitFor(() => {
      expect(search).toHaveBeenCalledTimes(1);
    });
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

    render(<NotesPane />);

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

    render(<NotesPane />);

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

    render(<NotesPane />);

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

    render(<NotesPane />);

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

    render(<NotesPane />);

    await user.click(screen.getByRole("button", { name: "Sort Notes" }));
    expect(screen.getByText("View")).toBeInTheDocument();
    expect(screen.getByText("Date")).toBeInTheDocument();
    expect(screen.getByText("Modified")).toBeInTheDocument();
    expect(screen.getByText("2 Lines")).toBeInTheDocument();

    await user.click(screen.getByRole("menuitem", { name: /Date/ }));
    await user.click(screen.getByRole("menuitemradio", { name: "Created Time" }));
    await user.click(screen.getByRole("button", { name: "Sort Notes" }));
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Folder Path" }));
    await user.click(screen.getByRole("button", { name: "Sort Notes" }));
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Filename" }));
    await user.click(screen.getByRole("button", { name: "Sort Notes" }));
    await user.click(screen.getByRole("menuitem", { name: /Text Preview/ }));
    await user.click(screen.getByRole("menuitemradio", { name: "3 Lines" }));

    expect(setNoteListViewOptions).toHaveBeenNthCalledWith(1, {
      noteListDateMode: "created",
    });
    expect(setNoteListViewOptions).toHaveBeenNthCalledWith(2, {
      showNoteListFolderPath: false,
    });
    expect(setNoteListViewOptions).toHaveBeenNthCalledWith(3, {
      showNoteListFilename: true,
    });
    expect(setNoteListViewOptions).toHaveBeenNthCalledWith(4, {
      noteListPreviewLines: 3,
    });
  });
});

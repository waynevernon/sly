import userEvent from "@testing-library/user-event";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchResult } from "../../services/notes";
import { NotesPane } from "./NotesPane";

vi.mock("../../context/NotesContext", () => ({
  useNotes: vi.fn(),
}));

vi.mock("../notes/NoteList", () => ({
  NoteList: ({
    items,
    emptyMessage,
  }: {
    items: Array<{ id: string; title: string }>;
    emptyMessage: string;
  }) => (
    <div>
      <div data-testid="empty-message">{emptyMessage}</div>
      <ul>
        {items.map((item) => (
          <li key={item.id}>{item.title}</li>
        ))}
      </ul>
    </div>
  ),
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
    folderIcons: {},
    noteSortMode: "modifiedDesc",
    selectedFolderPath: null,
    createNote: vi.fn(),
    search: vi.fn(),
    searchQuery: "",
    searchResults: [] as SearchResult[],
    clearSearch: vi.fn(),
    setNoteSortMode: vi.fn(),
    ...overrides,
  } as never;
}

describe("NotesPane", () => {
  beforeEach(async () => {
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
    expect(screen.getByTestId("empty-message")).toHaveTextContent(
      "No results found",
    );
  });
});

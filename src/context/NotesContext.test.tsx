import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as notesService from "../services/notes";
import { NotesProvider, useNotes } from "./NotesContext";

type SearchResult = {
  id: string;
  title: string;
  preview: string;
  modified: number;
  score: number;
};

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

vi.mock("../services/notes", () => ({
  getNotesFolder: vi.fn(),
  setNotesFolder: vi.fn(),
  listNotes: vi.fn(),
  readNote: vi.fn(),
  saveNote: vi.fn(),
  deleteNote: vi.fn(),
  createNote: vi.fn(),
  listFolders: vi.fn(),
  createFolder: vi.fn(),
  deleteFolder: vi.fn(),
  renameFolder: vi.fn(),
  moveNote: vi.fn(),
  moveFolder: vi.fn(),
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
  patchSettings: vi.fn(),
  getAppearanceSettings: vi.fn(),
  updateAppearanceSettings: vi.fn(),
  updateGitEnabled: vi.fn(),
  searchNotes: vi.fn(),
  startFileWatcher: vi.fn(),
  previewNoteName: vi.fn(),
}));

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function Wrapper({ children }: PropsWithChildren) {
  return <NotesProvider>{children}</NotesProvider>;
}

describe("NotesContext", () => {
  beforeEach(() => {
    vi.mocked(notesService.getNotesFolder).mockResolvedValue("/notes");
    vi.mocked(notesService.listNotes).mockResolvedValue([
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
    ]);
    vi.mocked(notesService.getSettings).mockResolvedValue({});
    vi.mocked(notesService.updateSettings).mockResolvedValue();
    vi.mocked(notesService.startFileWatcher).mockResolvedValue();
    vi.mocked(notesService.searchNotes).mockResolvedValue([]);
  });

  it("clears search results for blank queries", async () => {
    const { result } = renderHook(() => useNotes(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.search("   ");
    });

    expect(result.current.searchResults).toEqual([]);
    expect(result.current.isSearching).toBe(false);
  });

  it("shows instant local matches before async search resolves", async () => {
    const pending = createDeferred<SearchResult[]>();
    vi.mocked(notesService.searchNotes).mockReturnValueOnce(pending.promise);

    const { result } = renderHook(() => useNotes(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.notes).toHaveLength(2);
    });

    act(() => {
      void result.current.search("alp");
    });

    expect(result.current.searchResults.map((note) => note.id)).toContain("alpha");
    expect(result.current.isSearching).toBe(true);

    pending.resolve([]);

    await waitFor(() => {
      expect(result.current.isSearching).toBe(false);
    });
  });

  it("ignores stale async search results", async () => {
    const first = createDeferred<SearchResult[]>();
    const second = createDeferred<SearchResult[]>();
    vi.mocked(notesService.searchNotes)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const { result } = renderHook(() => useNotes(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.notes).toHaveLength(2);
    });

    act(() => {
      void result.current.search("alp");
    });
    act(() => {
      void result.current.search("bet");
    });

    first.resolve([
      {
        id: "alpha",
        title: "Alpha remote",
        preview: "stale",
        modified: 5,
        score: 10,
      },
    ]);
    second.resolve([
      {
        id: "beta",
        title: "Beta remote",
        preview: "fresh",
        modified: 6,
        score: 10,
      },
    ]);

    await waitFor(() => {
      expect(result.current.isSearching).toBe(false);
    });

    expect(result.current.searchQuery).toBe("bet");
    expect(result.current.searchResults.map((note) => note.id)).toContain("beta");
    expect(result.current.searchResults.map((note) => note.id)).not.toContain("alpha");
  });

  it("persists sanitized manual folder order", async () => {
    const { result } = renderHook(() => useNotes(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.setFolderManualOrder("", ["docs", "docs", "", "journal"]);
    });

    expect(notesService.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        folderManualOrder: {
          "": ["docs", "journal"],
        },
      }),
    );
    expect(result.current.folderManualOrder).toEqual({
      "": ["docs", "journal"],
    });
  });

  it("removes manual folder order entries when cleared", async () => {
    vi.mocked(notesService.getSettings).mockResolvedValueOnce({
      folderManualOrder: {
        "": ["docs"],
      },
    });

    const { result } = renderHook(() => useNotes(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.setFolderManualOrder("", []);
    });

    expect(notesService.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        folderManualOrder: undefined,
      }),
    );
    expect(result.current.folderManualOrder).toEqual({});
  });
});

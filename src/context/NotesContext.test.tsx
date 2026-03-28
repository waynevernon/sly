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
  deleteNotes: vi.fn(),
  createNote: vi.fn(),
  listFolders: vi.fn(),
  createFolder: vi.fn(),
  deleteFolder: vi.fn(),
  renameFolder: vi.fn(),
  moveNote: vi.fn(),
  moveNotes: vi.fn(),
  moveFolder: vi.fn(),
  getSettings: vi.fn(),
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
    vi.mocked(notesService.patchSettings).mockResolvedValue();
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

    expect(notesService.patchSettings).toHaveBeenCalledWith({
      folderManualOrder: {
        "": ["docs", "journal"],
      },
    });
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

    expect(notesService.patchSettings).toHaveBeenCalledWith({
      folderManualOrder: null,
    });
    expect(result.current.folderManualOrder).toEqual({});
  });

  it("persists note list view settings together with normalized defaults", async () => {
    const { result } = renderHook(() => useNotes(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.noteListDateMode).toBe("modified");
    expect(result.current.noteListPreviewLines).toBe(2);
    expect(result.current.showNoteCounts).toBe(true);
    expect(result.current.showNoteListFilename).toBe(false);
    expect(result.current.showNoteListFolderPath).toBe(true);
    expect(result.current.showNoteListPreview).toBe(true);

    await act(async () => {
      await result.current.setNoteListViewOptions({
        noteListDateMode: "off",
        noteListPreviewLines: 0,
        showNoteCounts: false,
        showNoteListFilename: true,
        showNoteListFolderPath: false,
      });
    });

    expect(notesService.patchSettings).toHaveBeenLastCalledWith({
      noteListDateMode: "off",
      showNoteListPreview: false,
      showNoteCounts: false,
      showNoteListFilename: true,
      showNoteListFolderPath: false,
    });
    expect(result.current.noteListDateMode).toBe("off");
    expect(result.current.noteListPreviewLines).toBe(0);
    expect(result.current.showNoteCounts).toBe(false);
    expect(result.current.showNoteListFilename).toBe(true);
    expect(result.current.showNoteListFolderPath).toBe(false);
    expect(result.current.showNoteListPreview).toBe(false);
  });

  it("tracks single and toggled note selections separately from the active note", async () => {
    vi.mocked(notesService.readNote).mockImplementation(async (id) => ({
      id,
      title: id,
      content: "",
      path: `/notes/${id}.md`,
      modified: 1,
    }));

    const { result } = renderHook(() => useNotes(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.notes).toHaveLength(2);
    });

    await act(async () => {
      await result.current.selectNote("alpha");
    });

    expect(result.current.selectedNoteId).toBe("alpha");
    expect(result.current.selectedNoteIds).toEqual(["alpha"]);

    act(() => {
      result.current.toggleNoteSelection("beta");
    });

    expect(result.current.selectedNoteId).toBe("alpha");
    expect(result.current.selectedNoteIds).toEqual(["alpha", "beta"]);
  });

  it("selects visible ranges and can clear back to the active note", async () => {
    vi.mocked(notesService.readNote).mockImplementation(async (id) => ({
      id,
      title: id,
      content: "",
      path: `/notes/${id}.md`,
      modified: 1,
    }));

    const { result } = renderHook(() => useNotes(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.notes).toHaveLength(2);
    });

    await act(async () => {
      await result.current.selectNote("alpha");
    });

    act(() => {
      result.current.selectNoteRange("beta");
    });

    expect(result.current.selectedNoteIds).toEqual(["alpha", "beta"]);

    act(() => {
      result.current.clearNoteSelection();
    });

    expect(result.current.selectedNoteIds).toEqual(["alpha"]);
  });

  it("selects all visible notes", async () => {
    const { result } = renderHook(() => useNotes(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.notes).toHaveLength(2);
    });

    act(() => {
      result.current.selectAllVisibleNotes();
    });

    expect(result.current.selectedNoteIds).toEqual(["alpha", "beta"]);
  });

  it("refreshes active search results after deleting selected notes", async () => {
    vi.mocked(notesService.searchNotes)
      .mockResolvedValueOnce([
        {
          id: "alpha",
          title: "Alpha note",
          preview: "planning",
          modified: 2,
          score: 10,
        },
        {
          id: "beta",
          title: "Beta note",
          preview: "shipping",
          modified: 1,
          score: 8,
        },
      ])
      .mockResolvedValueOnce([]);
    vi.mocked(notesService.deleteNotes).mockImplementation(async () => {
      vi.mocked(notesService.listNotes).mockResolvedValue([]);
    });
    vi.mocked(notesService.readNote).mockImplementation(async (id) => ({
      id,
      title: id,
      content: "",
      path: `/notes/${id}.md`,
      modified: 1,
    }));

    const { result } = renderHook(() => useNotes(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.notes).toHaveLength(2);
    });

    await act(async () => {
      await result.current.search("a");
      await result.current.selectNote("alpha");
    });

    act(() => {
      result.current.toggleNoteSelection("beta");
    });

    await act(async () => {
      await result.current.deleteSelectedNotes();
    });

    await waitFor(() => {
      expect(notesService.deleteNotes).toHaveBeenCalledWith(["alpha", "beta"]);
      expect(result.current.searchResults).toEqual([]);
    });
  });

  it("tracks recent notes in most-recent-first order and caps the list at five", async () => {
    vi.mocked(notesService.listNotes).mockResolvedValue([
      { id: "alpha", title: "Alpha", preview: "", modified: 6, created: 6 },
      { id: "beta", title: "Beta", preview: "", modified: 5, created: 5 },
      { id: "gamma", title: "Gamma", preview: "", modified: 4, created: 4 },
      { id: "delta", title: "Delta", preview: "", modified: 3, created: 3 },
      { id: "epsilon", title: "Epsilon", preview: "", modified: 2, created: 2 },
      { id: "zeta", title: "Zeta", preview: "", modified: 1, created: 1 },
    ]);
    vi.mocked(notesService.getSettings).mockResolvedValueOnce({
      recentNoteIds: ["beta", "gamma", "delta", "epsilon", "zeta"],
    });
    vi.mocked(notesService.readNote).mockImplementation(async (id) => ({
      id,
      title: id,
      content: "",
      path: `/notes/${id}.md`,
      modified: 1,
    }));

    const { result } = renderHook(() => useNotes(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.notes).toHaveLength(6);
    });

    await act(async () => {
      await result.current.selectNote("alpha");
    });

    await waitFor(() => {
      expect(result.current.settings.recentNoteIds).toEqual([
        "alpha",
        "beta",
        "gamma",
        "delta",
        "epsilon",
      ]);
    });
    expect(notesService.patchSettings).toHaveBeenLastCalledWith({
      recentNoteIds: ["alpha", "beta", "gamma", "delta", "epsilon"],
    });

    await act(async () => {
      await result.current.selectNote("gamma");
    });

    await waitFor(() => {
      expect(result.current.settings.recentNoteIds).toEqual([
        "gamma",
        "alpha",
        "beta",
        "delta",
        "epsilon",
      ]);
    });
    expect(notesService.patchSettings).toHaveBeenLastCalledWith({
      recentNoteIds: ["gamma", "alpha", "beta", "delta", "epsilon"],
    });
  });

  it("keeps recent scope order stable while persisting viewed-note recency", async () => {
    vi.mocked(notesService.getSettings).mockResolvedValueOnce({
      recentNoteIds: ["beta", "alpha"],
    });
    vi.mocked(notesService.readNote).mockImplementation(async (id) => ({
      id,
      title: id,
      content: "",
      path: `/notes/${id}.md`,
      modified: 1,
    }));

    const { result } = renderHook(() => useNotes(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.selectRecentNotes();
    });

    expect(result.current.scopedNotes.map((note) => note.id)).toEqual([
      "beta",
      "alpha",
    ]);

    await act(async () => {
      await result.current.selectNote("alpha");
    });

    await waitFor(() => {
      expect(result.current.settings.recentNoteIds).toEqual(["alpha", "beta"]);
    });

    expect(result.current.scopedNotes.map((note) => note.id)).toEqual([
      "beta",
      "alpha",
    ]);
  });

  it("refreshes recent scope ordering after leaving and re-entering the scope", async () => {
    vi.mocked(notesService.getSettings).mockResolvedValueOnce({
      recentNoteIds: ["beta", "alpha"],
    });
    vi.mocked(notesService.readNote).mockImplementation(async (id) => ({
      id,
      title: id,
      content: "",
      path: `/notes/${id}.md`,
      modified: 1,
    }));

    const { result } = renderHook(() => useNotes(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.selectRecentNotes();
    });

    await act(async () => {
      await result.current.selectNote("alpha");
    });

    await waitFor(() => {
      expect(result.current.settings.recentNoteIds).toEqual(["alpha", "beta"]);
    });

    expect(result.current.scopedNotes.map((note) => note.id)).toEqual([
      "beta",
      "alpha",
    ]);

    act(() => {
      result.current.selectFolder(null);
      result.current.selectRecentNotes();
    });

    expect(result.current.scopedNotes.map((note) => note.id)).toEqual([
      "alpha",
      "beta",
    ]);
  });

  it("does not update recent notes when opening a note fails", async () => {
    vi.mocked(notesService.readNote).mockRejectedValue(new Error("boom"));

    const { result } = renderHook(() => useNotes(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    vi.mocked(notesService.patchSettings).mockClear();

    await act(async () => {
      await result.current.selectNote("alpha");
    });

    expect(result.current.settings.recentNoteIds).toBeUndefined();
    expect(notesService.patchSettings).not.toHaveBeenCalled();
  });

  it("remaps recent note ids when a note is renamed on save", async () => {
    vi.mocked(notesService.getSettings).mockResolvedValueOnce({
      recentNoteIds: ["alpha", "beta"],
    });
    vi.mocked(notesService.readNote).mockImplementation(async (id) => ({
      id,
      title: id,
      content: "",
      path: `/notes/${id}.md`,
      modified: 1,
    }));
    vi.mocked(notesService.saveNote).mockResolvedValue({
      id: "alpha-renamed",
      title: "alpha-renamed",
      content: "renamed",
      path: "/notes/alpha-renamed.md",
      modified: 2,
    });

    const { result } = renderHook(() => useNotes(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.selectNote("alpha");
    });

    vi.mocked(notesService.patchSettings).mockClear();

    await act(async () => {
      await result.current.saveNote("renamed", "alpha");
    });

    await waitFor(() => {
      expect(result.current.settings.recentNoteIds).toEqual([
        "alpha-renamed",
        "beta",
      ]);
    });
  });

  it("prunes deleted notes from recent note ids", async () => {
    vi.mocked(notesService.getSettings).mockResolvedValueOnce({
      recentNoteIds: ["beta", "alpha"],
    });
    vi.mocked(notesService.deleteNote).mockImplementation(async () => {
      vi.mocked(notesService.listNotes).mockResolvedValue([
        {
          id: "alpha",
          title: "Alpha note",
          preview: "planning",
          modified: 2,
          created: 2,
        },
      ]);
    });

    const { result } = renderHook(() => useNotes(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.deleteNote("beta");
    });

    await waitFor(() => {
      expect(result.current.settings.recentNoteIds).toEqual(["alpha"]);
    });
  });

  it("remaps recent note ids when a note is moved", async () => {
    vi.mocked(notesService.getSettings).mockResolvedValueOnce({
      recentNoteIds: ["beta", "alpha"],
    });
    vi.mocked(notesService.moveNote).mockImplementation(async () => {
      vi.mocked(notesService.listNotes).mockResolvedValue([
        {
          id: "work/beta",
          title: "Beta note",
          preview: "shipping",
          modified: 1,
          created: 1,
        },
        {
          id: "alpha",
          title: "Alpha note",
          preview: "planning",
          modified: 2,
          created: 2,
        },
      ]);
      return "work/beta";
    });

    const { result } = renderHook(() => useNotes(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.moveNote("beta", "work");
    });

    await waitFor(() => {
      expect(result.current.settings.recentNoteIds).toEqual([
        "work/beta",
        "alpha",
      ]);
    });
  });

  it("remaps recent note ids when a folder is renamed", async () => {
    vi.mocked(notesService.listNotes).mockResolvedValue([
      {
        id: "docs/alpha",
        title: "Alpha",
        preview: "",
        modified: 2,
        created: 2,
      },
      {
        id: "docs/beta",
        title: "Beta",
        preview: "",
        modified: 1,
        created: 1,
      },
    ]);
    vi.mocked(notesService.getSettings).mockResolvedValueOnce({
      recentNoteIds: ["docs/alpha", "docs/beta"],
    });
    vi.mocked(notesService.renameFolder).mockImplementation(async () => {
      vi.mocked(notesService.listNotes).mockResolvedValue([
        {
          id: "archive/alpha",
          title: "Alpha",
          preview: "",
          modified: 2,
          created: 2,
        },
        {
          id: "archive/beta",
          title: "Beta",
          preview: "",
          modified: 1,
          created: 1,
        },
      ]);
    });

    const { result } = renderHook(() => useNotes(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.renameFolder("docs", "archive");
    });

    await waitFor(() => {
      expect(result.current.settings.recentNoteIds).toEqual([
        "archive/alpha",
        "archive/beta",
      ]);
    });
  });

  it("shows recent scope in stored recent order instead of note sort order", async () => {
    vi.mocked(notesService.getSettings).mockResolvedValueOnce({
      recentNoteIds: ["beta", "alpha"],
    });

    const { result } = renderHook(() => useNotes(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.selectRecentNotes();
    });

    expect(result.current.scopedNotes.map((note) => note.id)).toEqual([
      "beta",
      "alpha",
    ]);
  });

  it("defaults showRecentNotes on and can hide the recent scope", async () => {
    const { result } = renderHook(() => useNotes(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.showRecentNotes).toBe(true);

    act(() => {
      result.current.selectRecentNotes();
    });

    await act(async () => {
      await result.current.setShowRecentNotes(false);
    });

    expect(notesService.patchSettings).toHaveBeenCalledWith({
      showRecentNotes: false,
    });
    expect(result.current.showRecentNotes).toBe(false);
    expect(result.current.selectedScope).toEqual({ type: "all" });
  });
});

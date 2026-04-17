import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as notesService from "../services/notes";
import type { Settings } from "../types/note";
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
  renameNote: vi.fn(),
  deleteNote: vi.fn(),
  deleteNotes: vi.fn(),
  createNote: vi.fn(),
  duplicateNote: vi.fn(),
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

function createSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    schemaVersion: 1,
    showNoteCounts: true,
    showNotesFromSubfolders: false,
    noteListDateMode: "modified",
    showNoteListFilename: true,
    showNoteListFolderPath: false,
    showNoteListPreview: true,
    noteListPreviewLines: 2,
    noteSortMode: "modifiedDesc",
    folderSortMode: "nameAsc",
    ...overrides,
  };
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
    vi.mocked(notesService.listFolders).mockResolvedValue([]);
    vi.mocked(notesService.getSettings).mockResolvedValue(createSettings());
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

  it("rethrows create folder failures so the tree does not continue on a fake success path", async () => {
    vi.mocked(notesService.createFolder).mockRejectedValueOnce(new Error("exists"));

    const { result } = renderHook(() => useNotes(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    let thrown: unknown;
    await act(async () => {
      try {
        await result.current.createFolder("", "docs");
      } catch (error) {
        thrown = error;
      }
    });

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe("exists");
    expect(result.current.error).toBe("exists");
  });

  it("rethrows rename folder failures so the tree does not continue on a fake success path", async () => {
    vi.mocked(notesService.renameFolder).mockRejectedValueOnce(new Error("collision"));

    const { result } = renderHook(() => useNotes(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    let thrown: unknown;
    await act(async () => {
      try {
        await result.current.renameFolder("docs", "archive");
      } catch (error) {
        thrown = error;
      }
    });

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe("collision");
    expect(result.current.error).toBe("collision");
  });

  it("persists note list view settings together with normalized defaults", async () => {
    const { result } = renderHook(() => useNotes(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.noteListDateMode).toBe("modified");
    expect(result.current.noteListPreviewLines).toBe(2);
    expect(result.current.showNoteCounts).toBe(true);
    expect(result.current.showNotesFromSubfolders).toBe(false);
    expect(result.current.showNoteListFilename).toBe(true);
    expect(result.current.showNoteListFolderPath).toBe(false);
    expect(result.current.showNoteListPreview).toBe(true);

    await act(async () => {
      await result.current.setNoteListViewOptions({
        noteListDateMode: "off",
        noteListPreviewLines: 0,
        showNoteCounts: false,
        showNotesFromSubfolders: true,
        showNoteListFilename: true,
        showNoteListFolderPath: false,
      });
    });

    expect(notesService.patchSettings).toHaveBeenLastCalledWith({
      noteListDateMode: "off",
      showNoteListPreview: false,
      showNoteCounts: false,
      showNotesFromSubfolders: true,
    });
    expect(result.current.noteListDateMode).toBe("off");
    expect(result.current.noteListPreviewLines).toBe(0);
    expect(result.current.showNoteCounts).toBe(false);
    expect(result.current.showNotesFromSubfolders).toBe(true);
    expect(result.current.showNoteListFilename).toBe(true);
    expect(result.current.showNoteListFolderPath).toBe(false);
    expect(result.current.showNoteListPreview).toBe(false);
  });

  it("serializes collapsed folder writes so older saves cannot overwrite newer state", async () => {
    const firstPatch = createDeferred<void>();
    const secondPatch = createDeferred<void>();

    vi.mocked(notesService.getSettings).mockResolvedValueOnce(createSettings({
      collapsedFolders: ["docs"],
    }));
    vi.mocked(notesService.patchSettings)
      .mockReturnValueOnce(firstPatch.promise)
      .mockReturnValueOnce(secondPatch.promise);

    const { result } = renderHook(() => useNotes(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    vi.mocked(notesService.patchSettings).mockClear();

    let firstSave!: Promise<void>;
    let secondSave!: Promise<void>;
    act(() => {
      firstSave = result.current.setCollapsedFolders(["docs", "journal"]);
      secondSave = result.current.setCollapsedFolders(["journal"]);
    });

    await waitFor(() => {
      expect(notesService.patchSettings).toHaveBeenCalledTimes(1);
    });
    expect(notesService.patchSettings).toHaveBeenNthCalledWith(1, {
      collapsedFolders: ["docs", "journal"],
    });

    firstPatch.resolve();
    await act(async () => {
      await firstSave;
    });

    await waitFor(() => {
      expect(notesService.patchSettings).toHaveBeenCalledTimes(2);
    });
    expect(notesService.patchSettings).toHaveBeenNthCalledWith(2, {
      collapsedFolders: ["journal"],
    });

    secondPatch.resolve();
    await act(async () => {
      await secondSave;
    });

    expect(result.current.settings.collapsedFolders).toEqual(["journal"]);
  });

  it("ignores stale settings refreshes after a newer collapse-state save", async () => {
    const staleRefresh = createDeferred<Settings>();

    vi.mocked(notesService.getSettings)
      .mockResolvedValueOnce(createSettings({
        collapsedFolders: ["docs"],
      }))
      .mockReturnValueOnce(staleRefresh.promise);
    vi.mocked(notesService.renameFolder).mockResolvedValue();

    const { result } = renderHook(() => useNotes(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    vi.mocked(notesService.getSettings).mockClear();

    let renamePromise!: Promise<void>;
    act(() => {
      renamePromise = result.current.renameFolder("docs", "archive");
    });

    await waitFor(() => {
      expect(notesService.renameFolder).toHaveBeenCalledWith("docs", "archive");
    });
    await waitFor(() => {
      expect(notesService.getSettings).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      await result.current.setCollapsedFolders([]);
    });

    expect(result.current.settings.collapsedFolders).toEqual([]);

    staleRefresh.resolve(createSettings({
      collapsedFolders: ["archive"],
    }));

    await act(async () => {
      await renamePromise;
    });

    expect(result.current.settings.collapsedFolders).toEqual([]);
  });

  it("keeps folder scope direct-only unless notes from subfolders is enabled", async () => {
    vi.mocked(notesService.listNotes).mockResolvedValue([
      {
        id: "docs/alpha",
        title: "Alpha",
        preview: "",
        modified: 3,
        created: 3,
      },
      {
        id: "docs/reference/beta",
        title: "Beta",
        preview: "",
        modified: 2,
        created: 2,
      },
      {
        id: "docs/reference/api/gamma",
        title: "Gamma",
        preview: "",
        modified: 1,
        created: 1,
      },
    ]);

    const { result } = renderHook(() => useNotes(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.selectFolder("docs");
    });

    expect(result.current.scopedNotes.map((note) => note.id)).toEqual([
      "docs/alpha",
    ]);

    await act(async () => {
      await result.current.setNoteListViewOptions({
        showNotesFromSubfolders: true,
      });
    });

    expect(result.current.scopedNotes.map((note) => note.id)).toEqual([
      "docs/alpha",
      "docs/reference/beta",
      "docs/reference/api/gamma",
    ]);
  });

  it("keeps the root notes scope top-level-only unless notes from subfolders is enabled", async () => {
    vi.mocked(notesService.listNotes).mockResolvedValue([
      {
        id: "alpha",
        title: "Alpha",
        preview: "",
        modified: 3,
        created: 3,
      },
      {
        id: "docs/beta",
        title: "Beta",
        preview: "",
        modified: 2,
        created: 2,
      },
      {
        id: "docs/reference/gamma",
        title: "Gamma",
        preview: "",
        modified: 1,
        created: 1,
      },
    ]);

    const { result } = renderHook(() => useNotes(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.selectedScope).toEqual({ type: "all" });
    expect(result.current.scopedNotes.map((note) => note.id)).toEqual(["alpha"]);

    await act(async () => {
      await result.current.setNoteListViewOptions({
        showNotesFromSubfolders: true,
      });
    });

    expect(result.current.scopedNotes.map((note) => note.id)).toEqual([
      "alpha",
      "docs/beta",
      "docs/reference/gamma",
    ]);
  });

  it("keeps the active descendant note selected when folder scope includes subfolders", async () => {
    vi.mocked(notesService.listNotes).mockResolvedValue([
      {
        id: "docs/alpha",
        title: "Alpha",
        preview: "",
        modified: 3,
        created: 3,
      },
      {
        id: "docs/reference/beta",
        title: "Beta",
        preview: "",
        modified: 2,
        created: 2,
      },
    ]);
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

    await act(async () => {
      await result.current.setNoteListViewOptions({
        showNotesFromSubfolders: true,
      });
      await result.current.selectNote("docs/reference/beta");
    });

    act(() => {
      result.current.selectFolder("docs");
    });

    expect(result.current.selectedScope).toEqual({
      type: "folder",
      path: "docs",
    });
    expect(result.current.selectedNoteId).toBe("docs/reference/beta");
  });

  it("does not snap folder scope to a child folder when selecting a descendant note", async () => {
    vi.mocked(notesService.listNotes).mockResolvedValue([
      {
        id: "docs/alpha",
        title: "Alpha",
        preview: "",
        modified: 3,
        created: 3,
      },
      {
        id: "docs/reference/beta",
        title: "Beta",
        preview: "",
        modified: 2,
        created: 2,
      },
    ]);
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

    await act(async () => {
      await result.current.setNoteListViewOptions({
        showNotesFromSubfolders: true,
      });
    });

    act(() => {
      result.current.selectFolder("docs");
    });

    await act(async () => {
      await result.current.selectNote("docs/reference/beta");
    });

    expect(result.current.selectedScope).toEqual({
      type: "folder",
      path: "docs",
    });
    expect(result.current.selectedNoteId).toBe("docs/reference/beta");
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
    vi.mocked(notesService.getSettings).mockResolvedValueOnce(createSettings({
      recentNoteIds: ["beta", "gamma", "delta", "epsilon", "zeta"],
    }));
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
    vi.mocked(notesService.getSettings).mockResolvedValueOnce(createSettings({
      recentNoteIds: ["beta", "alpha"],
    }));
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
    vi.mocked(notesService.getSettings).mockResolvedValueOnce(createSettings({
      recentNoteIds: ["beta", "alpha"],
    }));
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

  it("does not expand the folder tree when opening a note from recent scope", async () => {
    vi.mocked(notesService.listNotes).mockResolvedValue([
      {
        id: "docs/alpha",
        title: "Alpha note",
        preview: "planning",
        modified: 2,
        created: 2,
      },
    ]);
    vi.mocked(notesService.getSettings).mockResolvedValueOnce(createSettings({
      recentNoteIds: ["docs/alpha"],
    }));
    vi.mocked(notesService.readNote).mockResolvedValue({
      id: "docs/alpha",
      title: "Alpha note",
      content: "",
      path: "/notes/docs/alpha.md",
      modified: 2,
    });

    const { result } = renderHook(() => useNotes(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.selectRecentNotes();
    });

    await act(async () => {
      await result.current.selectNote("docs/alpha");
    });

    expect(result.current.folderRevealRequest).toBeNull();
  });

  it("publishes a new folder reveal request each time a folder is explicitly selected", async () => {
    const { result } = renderHook(() => useNotes(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.selectFolder("docs");
    });

    expect(result.current.folderRevealRequest).toEqual({
      path: "docs",
      version: 1,
    });

    act(() => {
      result.current.selectFolder("docs");
    });

    expect(result.current.folderRevealRequest).toEqual({
      path: "docs",
      version: 2,
    });
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
    vi.mocked(notesService.getSettings).mockResolvedValueOnce(createSettings({
      recentNoteIds: ["alpha", "beta"],
    }));
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

  it("refreshes the active recent scope after a note rename remap", async () => {
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
    vi.mocked(notesService.getSettings).mockResolvedValueOnce(createSettings({
      recentNoteIds: ["alpha", "beta"],
    }));
    vi.mocked(notesService.readNote).mockImplementation(async (id) => ({
      id,
      title: id,
      content: "",
      path: `/notes/${id}.md`,
      modified: 1,
    }));
    vi.mocked(notesService.saveNote).mockImplementation(async () => {
      vi.mocked(notesService.listNotes).mockResolvedValue([
        {
          id: "alpha-renamed",
          title: "Alpha renamed",
          preview: "planning",
          modified: 3,
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

      return {
        id: "alpha-renamed",
        title: "Alpha renamed",
        content: "renamed",
        path: "/notes/alpha-renamed.md",
        modified: 3,
      };
    });

    const { result } = renderHook(() => useNotes(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.selectRecentNotes();
    });

    expect(result.current.scopedNotes.map((note) => note.id)).toEqual([
      "alpha",
      "beta",
    ]);

    await act(async () => {
      await result.current.saveNote("renamed", "alpha");
    });

    await waitFor(() => {
      expect(result.current.scopedNotes.map((note) => note.id)).toEqual([
        "alpha-renamed",
        "beta",
      ]);
    });
  });

  it("prunes deleted notes from recent note ids", async () => {
    vi.mocked(notesService.getSettings).mockResolvedValueOnce(createSettings({
      recentNoteIds: ["beta", "alpha"],
    }));
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

  it("remaps recent and pinned note ids when a note is moved", async () => {
    vi.mocked(notesService.getSettings).mockResolvedValueOnce(createSettings({
      pinnedNoteIds: ["beta"],
      recentNoteIds: ["beta", "alpha"],
    }));
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
      expect(result.current.settings.pinnedNoteIds).toEqual(["work/beta"]);
    });
  });

  it("remaps recent and pinned note ids when multiple notes are moved", async () => {
    vi.mocked(notesService.getSettings).mockResolvedValueOnce(createSettings({
      pinnedNoteIds: ["beta"],
      recentNoteIds: ["beta", "alpha"],
    }));
    vi.mocked(notesService.readNote).mockImplementation(async (id) => ({
      id,
      title: id,
      content: "",
      path: `/notes/${id}.md`,
      modified: 1,
    }));
    vi.mocked(notesService.moveNotes).mockImplementation(async () => {
      vi.mocked(notesService.listNotes).mockResolvedValue([
        {
          id: "work/beta",
          title: "Beta note",
          preview: "shipping",
          modified: 1,
          created: 1,
        },
        {
          id: "work/alpha",
          title: "Alpha note",
          preview: "planning",
          modified: 2,
          created: 2,
        },
      ]);
      return [
        { from: "beta", to: "work/beta" },
        { from: "alpha", to: "work/alpha" },
      ];
    });

    const { result } = renderHook(() => useNotes(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.selectNote("beta");
    });

    act(() => {
      result.current.toggleNoteSelection("alpha");
    });

    await act(async () => {
      await result.current.moveSelectedNotes("work");
    });

    await waitFor(() => {
      expect(result.current.settings.recentNoteIds).toEqual([
        "work/beta",
        "work/alpha",
      ]);
      expect(result.current.settings.pinnedNoteIds).toEqual(["work/beta"]);
    });
  });

  it("refreshes the active recent scope after a note move remap", async () => {
    vi.mocked(notesService.getSettings).mockResolvedValueOnce(createSettings({
      recentNoteIds: ["beta", "alpha"],
    }));
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

    act(() => {
      result.current.selectRecentNotes();
    });

    expect(result.current.scopedNotes.map((note) => note.id)).toEqual([
      "beta",
      "alpha",
    ]);

    await act(async () => {
      await result.current.moveNote("beta", "work");
    });

    await waitFor(() => {
      expect(result.current.scopedNotes.map((note) => note.id)).toEqual([
        "work/beta",
        "alpha",
      ]);
    });
  });

  it("refreshes folder settings and remaps selection when a folder is moved", async () => {
    vi.mocked(notesService.listNotes).mockResolvedValue([
      {
        id: "docs/alpha",
        title: "Alpha",
        preview: "",
        modified: 2,
        created: 2,
      },
    ]);
    vi.mocked(notesService.getSettings)
      .mockResolvedValueOnce(createSettings({
        recentNoteIds: ["docs/alpha"],
        folderIcons: {
          docs: { colorId: "blue" },
        },
        collapsedFolders: ["docs"],
      }))
      .mockResolvedValueOnce(createSettings({
        recentNoteIds: ["archive/docs/alpha"],
        folderIcons: {
          "archive/docs": { colorId: "blue" },
        },
        collapsedFolders: ["archive/docs"],
      }));
    vi.mocked(notesService.moveFolder).mockImplementation(async () => {
      vi.mocked(notesService.listNotes).mockResolvedValue([
        {
          id: "archive/docs/alpha",
          title: "Alpha",
          preview: "",
          modified: 2,
          created: 2,
        },
      ]);
    });
    vi.mocked(notesService.readNote).mockResolvedValue({
      id: "archive/docs/alpha",
      title: "Alpha",
      content: "",
      path: "/notes/archive/docs/alpha.md",
      modified: 2,
    });

    const { result } = renderHook(() => useNotes(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.selectFolder("docs");
    });

    await act(async () => {
      await result.current.selectNote("docs/alpha");
    });

    await act(async () => {
      await result.current.moveFolder("docs", "archive");
    });

    await waitFor(() => {
      expect(result.current.settings.recentNoteIds).toEqual(["archive/docs/alpha"]);
    });
    expect(notesService.moveFolder).toHaveBeenCalledWith("docs", "archive");
    expect(result.current.settings.folderIcons).toEqual({
      "archive/docs": { colorId: "blue" },
    });
    expect(result.current.settings.collapsedFolders).toEqual(["archive/docs"]);
    expect(result.current.selectedScope).toEqual({
      type: "folder",
      path: "archive/docs",
    });
    expect(result.current.selectedNoteId).toBe("archive/docs/alpha");
  });

  it("refreshes folder settings and remaps selection when a folder is renamed", async () => {
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
    vi.mocked(notesService.getSettings)
      .mockResolvedValueOnce(createSettings({
        recentNoteIds: ["docs/alpha", "docs/beta"],
        folderIcons: {
          docs: { colorId: "blue" },
        },
        collapsedFolders: ["docs"],
      }))
      .mockResolvedValueOnce(createSettings({
        recentNoteIds: ["archive/alpha", "archive/beta"],
        folderIcons: {
          archive: { colorId: "blue" },
        },
        collapsedFolders: ["archive"],
      }));
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
    vi.mocked(notesService.readNote).mockResolvedValue({
      id: "archive/alpha",
      title: "Alpha",
      content: "",
      path: "/notes/archive/alpha.md",
      modified: 2,
    });

    const { result } = renderHook(() => useNotes(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.selectFolder("docs");
    });

    await act(async () => {
      await result.current.selectNote("docs/alpha");
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
    expect(result.current.settings.folderIcons).toEqual({
      archive: { colorId: "blue" },
    });
    expect(result.current.settings.collapsedFolders).toEqual(["archive"]);
    expect(result.current.selectedScope).toEqual({
      type: "folder",
      path: "archive",
    });
    expect(result.current.selectedNoteId).toBe("archive/alpha");
  });

  it("refreshes folder settings and clears selection when a folder is deleted", async () => {
    vi.mocked(notesService.listNotes).mockResolvedValue([
      {
        id: "docs/alpha",
        title: "Alpha",
        preview: "",
        modified: 2,
        created: 2,
      },
      {
        id: "journal/beta",
        title: "Beta",
        preview: "",
        modified: 1,
        created: 1,
      },
    ]);
    vi.mocked(notesService.getSettings)
      .mockResolvedValueOnce(createSettings({
        recentNoteIds: ["docs/alpha", "journal/beta"],
        folderIcons: {
          docs: { colorId: "blue" },
          journal: { colorId: "red" },
        },
        collapsedFolders: ["docs", "journal"],
      }))
      .mockResolvedValueOnce(createSettings({
        recentNoteIds: ["journal/beta"],
        folderIcons: {
          journal: { colorId: "red" },
        },
        collapsedFolders: ["journal"],
      }));
    vi.mocked(notesService.deleteFolder).mockImplementation(async () => {
      vi.mocked(notesService.listNotes).mockResolvedValue([
        {
          id: "journal/beta",
          title: "Beta",
          preview: "",
          modified: 1,
          created: 1,
        },
      ]);
    });
    vi.mocked(notesService.readNote).mockResolvedValue({
      id: "docs/alpha",
      title: "Alpha",
      content: "",
      path: "/notes/docs/alpha.md",
      modified: 2,
    });

    const { result } = renderHook(() => useNotes(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.selectFolder("docs");
    });

    await act(async () => {
      await result.current.selectNote("docs/alpha");
    });

    await act(async () => {
      await result.current.deleteFolder("docs");
    });

    await waitFor(() => {
      expect(result.current.settings.recentNoteIds).toEqual(["journal/beta"]);
    });
    expect(notesService.deleteFolder).toHaveBeenCalledWith("docs");
    expect(result.current.settings.folderIcons).toEqual({
      journal: { colorId: "red" },
    });
    expect(result.current.settings.collapsedFolders).toEqual(["journal"]);
    expect(result.current.selectedScope).toEqual({ type: "all" });
    expect(result.current.selectedNoteId).toBeNull();
  });

  it("shows recent scope in stored recent order instead of note sort order", async () => {
    vi.mocked(notesService.getSettings).mockResolvedValueOnce(createSettings({
      recentNoteIds: ["beta", "alpha"],
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
  });

  it("uses a folder-specific sort override for folder scope", async () => {
    vi.mocked(notesService.listNotes).mockResolvedValue([
      {
        id: "docs/zulu",
        title: "Zulu",
        preview: "z",
        modified: 9,
        created: 9,
      },
      {
        id: "docs/alpha",
        title: "Alpha",
        preview: "a",
        modified: 1,
        created: 1,
      },
      {
        id: "docs/mike",
        title: "Mike",
        preview: "m",
        modified: 5,
        created: 5,
      },
    ]);
    vi.mocked(notesService.getSettings).mockResolvedValueOnce(createSettings({
      noteSortMode: "modifiedDesc",
      pinnedNoteIds: ["docs/mike"],
      folderNoteSortModes: {
        docs: "titleAsc",
      },
    }));

    const { result } = renderHook(() => useNotes(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.selectFolder("docs");
    });

    expect(result.current.noteSortMode).toBe("titleAsc");
    expect(result.current.scopedNotes.map((note) => note.id)).toEqual([
      "docs/mike",
      "docs/alpha",
      "docs/zulu",
    ]);
  });

  it("falls back to the workspace note sort when a folder has no override", async () => {
    vi.mocked(notesService.listNotes).mockResolvedValue([
      {
        id: "docs/zulu",
        title: "Zulu",
        preview: "z",
        modified: 9,
        created: 9,
      },
      {
        id: "docs/alpha",
        title: "Alpha",
        preview: "a",
        modified: 1,
        created: 1,
      },
      {
        id: "docs/mike",
        title: "Mike",
        preview: "m",
        modified: 5,
        created: 5,
      },
    ]);
    vi.mocked(notesService.getSettings).mockResolvedValueOnce(createSettings({
      noteSortMode: "createdAsc",
    }));

    const { result } = renderHook(() => useNotes(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.selectFolder("docs");
    });

    expect(result.current.noteSortMode).toBe("createdAsc");
    expect(result.current.scopedNotes.map((note) => note.id)).toEqual([
      "docs/alpha",
      "docs/mike",
      "docs/zulu",
    ]);
  });

  it("stores folder sort changes as folder overrides instead of changing the workspace default", async () => {
    vi.mocked(notesService.listNotes).mockResolvedValue([
      {
        id: "docs/zulu",
        title: "Zulu",
        preview: "z",
        modified: 9,
        created: 9,
      },
      {
        id: "docs/alpha",
        title: "Alpha",
        preview: "a",
        modified: 1,
        created: 1,
      },
    ]);

    const { result } = renderHook(() => useNotes(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.selectFolder("docs");
    });

    await act(async () => {
      await result.current.setNoteSortMode("titleDesc");
    });

    expect(notesService.patchSettings).toHaveBeenCalledWith({
      folderNoteSortModes: {
        docs: "titleDesc",
      },
    });
    expect(result.current.settings.noteSortMode).toBe("modifiedDesc");
    expect(result.current.settings.folderNoteSortModes).toEqual({
      docs: "titleDesc",
    });
    expect(result.current.noteSortMode).toBe("titleDesc");
    expect(result.current.scopedNotes.map((note) => note.id)).toEqual([
      "docs/zulu",
      "docs/alpha",
    ]);
  });

  it("shows pinned scope in note sort order and filters out unpinned notes", async () => {
    vi.mocked(notesService.listNotes).mockResolvedValue([
      {
        id: "docs/zulu",
        title: "Zulu",
        preview: "z",
        modified: 9,
        created: 9,
      },
      {
        id: "docs/alpha",
        title: "Alpha",
        preview: "a",
        modified: 1,
        created: 1,
      },
      {
        id: "drafts/mike",
        title: "Mike",
        preview: "m",
        modified: 5,
        created: 5,
      },
    ]);
    vi.mocked(notesService.getSettings).mockResolvedValue(
      createSettings({
        pinnedNoteIds: ["docs/zulu", "docs/alpha"],
        noteSortMode: "titleAsc",
      }),
    );

    const { result } = renderHook(() => useNotes(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.selectPinnedNotes();
    });

    expect(result.current.selectedScope).toEqual({ type: "pinned" });
    expect(result.current.pinnedNotes.map((note) => note.id)).toEqual([
      "docs/alpha",
      "docs/zulu",
    ]);
    expect(result.current.scopedNotes.map((note) => note.id)).toEqual([
      "docs/alpha",
      "docs/zulu",
    ]);
  });

  it("defaults showPinnedNotes on and can hide the pinned scope", async () => {
    const { result } = renderHook(() => useNotes(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.showPinnedNotes).toBe(true);

    act(() => {
      result.current.selectPinnedNotes();
    });

    await act(async () => {
      await result.current.setShowPinnedNotes(false);
    });

    expect(notesService.patchSettings).toHaveBeenCalledWith({
      showPinnedNotes: false,
    });
    expect(result.current.showPinnedNotes).toBe(false);
    expect(result.current.selectedScope).toEqual({ type: "all" });
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

  it("keeps selection and current note in sync after an explicit rename", async () => {
    vi.mocked(notesService.readNote).mockResolvedValue({
      id: "alpha",
      title: "Alpha note",
      content: "# Alpha note\n",
      path: "/notes/alpha.md",
      modified: 2,
    });
    vi.mocked(notesService.renameNote).mockResolvedValue({
      id: "alpha-renamed",
      title: "Alpha renamed",
      content: "# Alpha renamed\n",
      path: "/notes/alpha-renamed.md",
      modified: 3,
    });
    vi.mocked(notesService.listNotes)
      .mockResolvedValueOnce([
        {
          id: "alpha",
          title: "Alpha note",
          preview: "planning",
          modified: 2,
          created: 2,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "alpha-renamed",
          title: "Alpha renamed",
          preview: "planning",
          modified: 3,
          created: 2,
        },
      ]);

    const { result } = renderHook(() => useNotes(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.selectNote("alpha");
    });

    await act(async () => {
      await result.current.renameNote("alpha", "Alpha renamed");
    });

    expect(notesService.renameNote).toHaveBeenCalledWith("alpha", "Alpha renamed");

    await waitFor(() => {
      expect(result.current.selectedNoteId).toBe("alpha-renamed");
      expect(result.current.currentNote?.id).toBe("alpha-renamed");
      expect(result.current.currentNote?.path).toBe("/notes/alpha-renamed.md");
    });
  });

  it("routes stale saves through the renamed note id", async () => {
    vi.mocked(notesService.readNote).mockResolvedValue({
      id: "alpha",
      title: "Alpha note",
      content: "# Alpha note\n",
      path: "/notes/alpha.md",
      modified: 2,
    });
    vi.mocked(notesService.renameNote).mockResolvedValue({
      id: "alpha-renamed",
      title: "Alpha renamed",
      content: "# Alpha renamed\n",
      path: "/notes/alpha-renamed.md",
      modified: 3,
    });
    vi.mocked(notesService.saveNote).mockResolvedValue({
      id: "alpha-renamed",
      title: "Alpha renamed",
      content: "# Alpha renamed\nBody",
      path: "/notes/alpha-renamed.md",
      modified: 4,
    });
    vi.mocked(notesService.listNotes)
      .mockResolvedValueOnce([
        {
          id: "alpha",
          title: "Alpha note",
          preview: "planning",
          modified: 2,
          created: 2,
        },
      ])
      .mockResolvedValue([
        {
          id: "alpha-renamed",
          title: "Alpha renamed",
          preview: "planning",
          modified: 4,
          created: 2,
        },
      ]);

    const { result } = renderHook(() => useNotes(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.selectNote("alpha");
    });

    await act(async () => {
      await result.current.renameNote("alpha", "Alpha renamed");
    });

    await act(async () => {
      await result.current.saveNote("# Alpha renamed\nBody", "alpha");
    });

    expect(notesService.saveNote).toHaveBeenCalledWith(
      "alpha-renamed",
      "# Alpha renamed\nBody",
    );
  });

  it("does not redirect saves after a renamed id is reused by a new note", async () => {
    vi.mocked(notesService.readNote).mockResolvedValue({
      id: "alpha",
      title: "Alpha note",
      content: "# Alpha note\n",
      path: "/notes/alpha.md",
      modified: 2,
    });
    vi.mocked(notesService.renameNote).mockResolvedValue({
      id: "alpha-renamed",
      title: "Alpha renamed",
      content: "# Alpha renamed\n",
      path: "/notes/alpha-renamed.md",
      modified: 3,
    });
    vi.mocked(notesService.createNote).mockResolvedValue({
      id: "alpha",
      title: "Alpha recycled",
      content: "# Alpha recycled\n\n",
      path: "/notes/alpha.md",
      modified: 4,
    });
    vi.mocked(notesService.saveNote).mockResolvedValue({
      id: "alpha",
      title: "Alpha recycled",
      content: "# Alpha recycled\nBody",
      path: "/notes/alpha.md",
      modified: 5,
    });
    vi.mocked(notesService.listNotes)
      .mockResolvedValueOnce([
        {
          id: "alpha",
          title: "Alpha note",
          preview: "planning",
          modified: 2,
          created: 2,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "alpha-renamed",
          title: "Alpha renamed",
          preview: "planning",
          modified: 3,
          created: 2,
        },
      ])
      .mockResolvedValue([
        {
          id: "alpha-renamed",
          title: "Alpha renamed",
          preview: "planning",
          modified: 3,
          created: 2,
        },
        {
          id: "alpha",
          title: "Alpha recycled",
          preview: "",
          modified: 4,
          created: 4,
        },
      ]);

    const { result } = renderHook(() => useNotes(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.selectNote("alpha");
    });

    await act(async () => {
      await result.current.renameNote("alpha", "Alpha renamed");
    });

    await act(async () => {
      await result.current.createNote();
    });

    await waitFor(() => {
      expect(result.current.selectedNoteId).toBe("alpha");
    });

    await act(async () => {
      await result.current.saveNote("# Alpha recycled\nBody", "alpha");
    });

    expect(notesService.saveNote).toHaveBeenCalledWith(
      "alpha",
      "# Alpha recycled\nBody",
    );
  });

  it("routes stale rename requests through the latest note id", async () => {
    vi.mocked(notesService.readNote).mockResolvedValue({
      id: "alpha",
      title: "Alpha note",
      content: "# Alpha note\n",
      path: "/notes/alpha.md",
      modified: 2,
    });
    vi.mocked(notesService.renameNote)
      .mockResolvedValueOnce({
        id: "alpha-renamed",
        title: "Alpha renamed",
        content: "# Alpha renamed\n",
        path: "/notes/alpha-renamed.md",
        modified: 3,
      })
      .mockResolvedValueOnce({
        id: "alpha-final",
        title: "Alpha final",
        content: "# Alpha final\n",
        path: "/notes/alpha-final.md",
        modified: 4,
      });
    vi.mocked(notesService.listNotes)
      .mockResolvedValueOnce([
        {
          id: "alpha",
          title: "Alpha note",
          preview: "planning",
          modified: 2,
          created: 2,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "alpha-renamed",
          title: "Alpha renamed",
          preview: "planning",
          modified: 3,
          created: 2,
        },
      ])
      .mockResolvedValue([
        {
          id: "alpha-final",
          title: "Alpha final",
          preview: "planning",
          modified: 4,
          created: 2,
        },
      ]);

    const { result } = renderHook(() => useNotes(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.selectNote("alpha");
    });

    await act(async () => {
      await result.current.renameNote("alpha", "Alpha renamed");
    });

    vi.mocked(notesService.renameNote).mockClear();

    await act(async () => {
      await result.current.renameNote("alpha", "Alpha final");
    });

    expect(notesService.renameNote).toHaveBeenCalledOnce();
    expect(notesService.renameNote).toHaveBeenCalledWith(
      "alpha-renamed",
      "Alpha final",
    );
  });

  it("routes stale selects through the latest note id", async () => {
    vi.mocked(notesService.readNote)
      .mockResolvedValueOnce({
        id: "alpha",
        title: "Alpha note",
        content: "# Alpha note\n",
        path: "/notes/alpha.md",
        modified: 2,
      })
      .mockResolvedValueOnce({
        id: "alpha-renamed",
        title: "Alpha renamed",
        content: "# Alpha renamed\n",
        path: "/notes/alpha-renamed.md",
        modified: 3,
      });
    vi.mocked(notesService.renameNote).mockResolvedValue({
      id: "alpha-renamed",
      title: "Alpha renamed",
      content: "# Alpha renamed\n",
      path: "/notes/alpha-renamed.md",
      modified: 3,
    });
    vi.mocked(notesService.listNotes)
      .mockResolvedValueOnce([
        {
          id: "alpha",
          title: "Alpha note",
          preview: "planning",
          modified: 2,
          created: 2,
        },
      ])
      .mockResolvedValue([
        {
          id: "alpha-renamed",
          title: "Alpha renamed",
          preview: "planning",
          modified: 3,
          created: 2,
        },
      ]);

    const { result } = renderHook(() => useNotes(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.selectNote("alpha");
    });

    await act(async () => {
      await result.current.renameNote("alpha", "Alpha renamed");
    });

    await act(async () => {
      await result.current.selectNote("alpha");
    });

    expect(notesService.readNote).toHaveBeenLastCalledWith("alpha-renamed");
    expect(result.current.selectedNoteId).toBe("alpha-renamed");
  });
});

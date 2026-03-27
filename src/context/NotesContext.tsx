import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { listen } from "@tauri-apps/api/event";
import {
  DEFAULT_FOLDER_SORT_MODE,
  DEFAULT_NOTE_SORT_MODE,
  type FolderManualOrder,
  type FolderSortMode,
  type Note,
  type NoteMetadata,
  type NoteSortMode,
  type Settings,
} from "../types/note";
import * as notesService from "../services/notes";
import type {
  FileChangeEventPayload,
  SearchResult,
} from "../services/notes";
import {
  sanitizeFolderIcons,
  type FolderIconsMap,
} from "../lib/folderIcons";

// Separate contexts to prevent unnecessary re-renders
// Data context: changes frequently, only subscribed by components that need the data
interface NotesDataContextValue {
  notes: NoteMetadata[];
  scopedNotes: NoteMetadata[];
  settings: Settings;
  folderIcons: FolderIconsMap;
  noteSortMode: NoteSortMode;
  folderSortMode: FolderSortMode;
  folderManualOrder: FolderManualOrder;
  selectedNoteId: string | null;
  selectedNoteIds: string[];
  selectedFolderPath: string | null;
  currentNote: Note | null;
  notesFolder: string | null;
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
  searchResults: SearchResult[];
  isSearching: boolean;
  hasExternalChanges: boolean;
  reloadVersion: number;
}

// Actions context: stable references, rarely causes re-renders
interface NotesActionsContextValue {
  selectNote: (id: string) => Promise<void>;
  toggleNoteSelection: (id: string) => void;
  selectNoteRange: (id: string) => void;
  clearNoteSelection: () => void;
  selectAllVisibleNotes: () => void;
  selectFolder: (path: string | null) => void;
  createNote: () => Promise<void>;
  consumePendingNewNote: (id: string) => boolean;
  saveNote: (content: string, noteId?: string) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  deleteSelectedNotes: () => Promise<void>;
  duplicateNote: (id: string) => Promise<void>;
  refreshNotes: () => Promise<void>;
  reloadCurrentNote: () => Promise<void>;
  setNotesFolder: (path: string) => Promise<void>;
  syncNotesFolder: (path: string) => Promise<void>;
  search: (query: string) => Promise<void>;
  clearSearch: () => void;
  pinNote: (id: string) => Promise<void>;
  unpinNote: (id: string) => Promise<void>;
  createNoteInFolder: (folderPath: string) => Promise<void>;
  createFolder: (parentPath: string, name: string) => Promise<void>;
  deleteFolder: (path: string) => Promise<void>;
  renameFolder: (oldPath: string, newName: string) => Promise<void>;
  moveNote: (id: string, targetFolder: string) => Promise<void>;
  moveSelectedNotes: (targetFolder: string) => Promise<void>;
  moveFolder: (path: string, targetParent: string) => Promise<void>;
  setFolderIcon: (path: string, iconName: string | null) => Promise<void>;
  setCollapsedFolders: (paths: string[]) => Promise<void>;
  setNoteSortMode: (mode: NoteSortMode) => Promise<void>;
  setFolderSortMode: (mode: FolderSortMode) => Promise<void>;
  setFolderManualOrder: (
    parentPath: string,
    orderedPaths: string[],
  ) => Promise<void>;
}

const NotesDataContext = createContext<NotesDataContextValue | null>(null);
const NotesActionsContext = createContext<NotesActionsContextValue | null>(null);

function getParentFolderPath(noteId: string): string | null {
  const lastSlash = noteId.lastIndexOf("/");
  return lastSlash > 0 ? noteId.substring(0, lastSlash) : null;
}

function getParentPath(path: string): string | null {
  const lastSlash = path.lastIndexOf("/");
  return lastSlash > 0 ? path.substring(0, lastSlash) : null;
}

function sanitizeFolderManualOrder(
  folderManualOrder: FolderManualOrder | null | undefined,
): FolderManualOrder {
  if (!folderManualOrder) return {};

  return Object.fromEntries(
    Object.entries(folderManualOrder)
      .filter(([parentPath, orderedPaths]) => {
        if (parentPath !== "" && parentPath.trim().length === 0) return false;
        return Array.isArray(orderedPaths);
      })
      .map(([parentPath, orderedPaths]) => {
        const uniquePaths = Array.from(
          new Set(
            orderedPaths.filter(
              (path): path is string =>
                typeof path === "string" && path.trim().length > 0,
            ),
          ),
        );
        return [parentPath, uniquePaths];
      })
      .filter(([, orderedPaths]) => orderedPaths.length > 0),
  );
}

function sanitizeCollapsedFolders(
  collapsedFolders: string[] | null | undefined,
): string[] | undefined {
  if (collapsedFolders === undefined || collapsedFolders === null) {
    return undefined;
  }

  return Array.from(
    new Set(
      collapsedFolders.filter(
        (path): path is string =>
          typeof path === "string" && path.trim().length > 0,
      ),
    ),
  );
}

function normalizeSettings(settings: Settings | null | undefined): Settings {
  const nextSettings = settings ? { ...settings } : {};
  nextSettings.noteSortMode ??= DEFAULT_NOTE_SORT_MODE;
  nextSettings.folderSortMode ??= DEFAULT_FOLDER_SORT_MODE;
  nextSettings.collapsedFolders = sanitizeCollapsedFolders(
    nextSettings.collapsedFolders,
  );
  const folderManualOrder = sanitizeFolderManualOrder(
    nextSettings.folderManualOrder,
  );
  nextSettings.folderManualOrder =
    Object.keys(folderManualOrder).length > 0 ? folderManualOrder : undefined;
  return nextSettings;
}

export function NotesProvider({ children }: { children: ReactNode }) {
  const [notes, setNotes] = useState<NoteMetadata[]>([]);
  const [settings, setSettings] = useState<Settings>(() => normalizeSettings({}));
  const [folderIcons, setFolderIcons] = useState<FolderIconsMap>({});
  const [selectedFolderPath, setSelectedFolderPath] = useState<string | null>(
    null,
  );
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const [currentNote, setCurrentNote] = useState<Note | null>(null);
  const [notesFolder, setNotesFolderState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasExternalChanges, setHasExternalChanges] = useState(false);
  // Increments when user manually refreshes, so Editor knows to reload content
  const [reloadVersion, setReloadVersion] = useState(0);

  // Track recently saved note IDs to ignore file-change events from our own saves
  const recentlySavedRef = useRef<Set<string>>(new Set());
  // Track pending refresh timeout to debounce refreshes during rapid saves
  const refreshTimeoutRef = useRef<number | null>(null);
  // Ref to access selectedNoteId in file watcher without re-registering listener
  const selectedNoteIdRef = useRef<string | null>(null);
  selectedNoteIdRef.current = selectedNoteId;
  const selectedNoteIdsRef = useRef<string[]>([]);
  selectedNoteIdsRef.current = selectedNoteIds;
  // Ref to access notes in search callback without re-creating it on every notes change
  const notesRef = useRef<NoteMetadata[]>([]);
  notesRef.current = notes;
  const searchQueryRef = useRef("");
  searchQueryRef.current = searchQuery;
  const searchResultsRef = useRef<SearchResult[]>([]);
  searchResultsRef.current = searchResults;
  const selectedFolderPathRef = useRef<string | null>(null);
  selectedFolderPathRef.current = selectedFolderPath;
  const selectionAnchorIdRef = useRef<string | null>(null);
  const selectionRangeEndIdRef = useRef<string | null>(null);
  // Monotonic counter to ignore stale async note selection responses.
  const selectRequestIdRef = useRef(0);
  // Monotonic counter to ignore stale async search responses
  const searchRequestIdRef = useRef(0);
  // Tracks the ID of a newly created note so Editor can focus its title.
  const pendingNewNoteIdRef = useRef<string | null>(null);
  const settingsRef = useRef<Settings>(settings);
  settingsRef.current = settings;
  const windowRefreshTimeoutRef = useRef<number | null>(null);

  const refreshNotes = useCallback(async () => {
    if (!notesFolder) return;
    try {
      const notesList = await notesService.listNotes();
      setNotes(notesList);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load notes");
    }
  }, [notesFolder]);

  const applySettings = useCallback((nextSettings: Settings) => {
    const normalizedSettings = normalizeSettings(nextSettings);
    setSettings(normalizedSettings);
    const nextFolderIcons = sanitizeFolderIcons(normalizedSettings.folderIcons);
    setFolderIcons(nextFolderIcons);
    return normalizedSettings;
  }, []);

  const refreshSettings = useCallback(async () => {
    const nextSettings = await notesService.getSettings();
    return applySettings(nextSettings);
  }, [applySettings]);

  const persistSettings = useCallback(
    async (updater: (currentSettings: Settings) => Settings) => {
      const nextSettings = normalizeSettings(updater(settingsRef.current));
      await notesService.updateSettings(nextSettings);
      return applySettings(nextSettings);
    },
    [applySettings],
  );

  const persistFolderManualOrder = useCallback(
    async (parentPath: string, orderedPaths: string[]) => {
      await persistSettings((currentSettings) => {
        const folderManualOrder = sanitizeFolderManualOrder(
          currentSettings.folderManualOrder,
        );
        if (orderedPaths.length > 0) {
          folderManualOrder[parentPath] = orderedPaths;
        } else {
          delete folderManualOrder[parentPath];
        }

        return {
          ...currentSettings,
          folderManualOrder:
            Object.keys(folderManualOrder).length > 0
              ? folderManualOrder
              : undefined,
        };
      });
    },
    [persistSettings],
  );

  const getVisibleNoteIds = useCallback(() => {
    if (searchQueryRef.current.trim()) {
      return searchResultsRef.current.map((result) => result.id);
    }

    if (selectedFolderPathRef.current === null) {
      return notesRef.current.map((note) => note.id);
    }

    return notesRef.current
      .filter(
        (note) => getParentFolderPath(note.id) === selectedFolderPathRef.current,
      )
      .map((note) => note.id);
  }, []);

  const setSelectionState = useCallback(
    (
      ids: string[],
      {
        anchorId = ids[0] ?? null,
        rangeEndId = ids[ids.length - 1] ?? anchorId,
      }: {
        anchorId?: string | null;
        rangeEndId?: string | null;
      } = {},
    ) => {
      setSelectedNoteIds(ids);
      selectionAnchorIdRef.current = anchorId;
      selectionRangeEndIdRef.current = rangeEndId;
    },
    [],
  );

  const collapseSelectionToActiveNote = useCallback(() => {
    const activeNoteId = selectedNoteIdRef.current;
    const visibleNoteIds = getVisibleNoteIds();
    if (activeNoteId && visibleNoteIds.includes(activeNoteId)) {
      setSelectionState([activeNoteId], {
        anchorId: activeNoteId,
        rangeEndId: activeNoteId,
      });
      return;
    }

    setSelectionState([], { anchorId: activeNoteId, rangeEndId: activeNoteId });
  }, [getVisibleNoteIds, setSelectionState]);


  const setNoteSortMode = useCallback(
    async (mode: NoteSortMode) => {
      await persistSettings((currentSettings) => ({
        ...currentSettings,
        noteSortMode: mode,
      }));
      await refreshNotes();
    },
    [persistSettings, refreshNotes],
  );

  const setFolderSortMode = useCallback(
    async (mode: FolderSortMode) => {
      await persistSettings((currentSettings) => ({
        ...currentSettings,
        folderSortMode: mode,
      }));
    },
    [persistSettings],
  );

  const setFolderManualOrder = useCallback(
    async (parentPath: string, orderedPaths: string[]) => {
      await persistFolderManualOrder(parentPath, orderedPaths);
    },
    [persistFolderManualOrder],
  );

  const setCollapsedFolders = useCallback(
    async (paths: string[]) => {
      await persistSettings((currentSettings) => ({
        ...currentSettings,
        collapsedFolders: sanitizeCollapsedFolders(paths),
      }));
    },
    [persistSettings],
  );

  // Debounced refresh - coalesces rapid saves into a single refresh
  const scheduleRefresh = useCallback(() => {
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }
    refreshTimeoutRef.current = window.setTimeout(() => {
      refreshTimeoutRef.current = null;
      refreshNotes();
    }, 300);
  }, [refreshNotes]);

  const selectFolder = useCallback((path: string | null) => {
    setSelectedFolderPath(path);
    if (
      path &&
      selectedNoteIdRef.current &&
      getParentFolderPath(selectedNoteIdRef.current) !== path
    ) {
      setSelectedNoteId(null);
      setSelectionState([], { anchorId: null, rangeEndId: null });
      setCurrentNote(null);
    }
    if (path) {
      window.dispatchEvent(new CustomEvent("expand-folder", { detail: path }));
    }
  }, [setSelectionState]);

  const selectNote = useCallback(async (id: string) => {
    const requestId = ++selectRequestIdRef.current;
    try {
      if (pendingNewNoteIdRef.current !== id) {
        pendingNewNoteIdRef.current = null;
      }
      // Set selected ID immediately for responsive UI
      setSelectedNoteId(id);
      const visibleNoteIds = getVisibleNoteIds();
      setSelectionState(visibleNoteIds.includes(id) ? [id] : [], {
        anchorId: id,
        rangeEndId: id,
      });
      setHasExternalChanges(false);
      const parentFolder = getParentFolderPath(id);
      if (
        selectedFolderPathRef.current !== null &&
        !searchQueryRef.current.trim() &&
        parentFolder !== selectedFolderPathRef.current
      ) {
        setSelectedFolderPath(parentFolder);
      }
      // Expand parent folders so the note is visible in the tree
      if (parentFolder) {
        window.dispatchEvent(
          new CustomEvent("expand-folder", {
            detail: parentFolder,
          }),
        );
      }
      const note = await notesService.readNote(id);
      if (requestId !== selectRequestIdRef.current) return;
      setCurrentNote(note);
    } catch (err) {
      if (requestId !== selectRequestIdRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load note");
    }
  }, [getVisibleNoteIds, setSelectionState]);

  const toggleNoteSelection = useCallback(
    (id: string) => {
      const visibleNoteIds = getVisibleNoteIds();
      if (!visibleNoteIds.includes(id)) return;

      const nextSelection = new Set(selectedNoteIdsRef.current);
      if (nextSelection.has(id)) {
        nextSelection.delete(id);
      } else {
        nextSelection.add(id);
      }

      setSelectionState(
        visibleNoteIds.filter((noteId) => nextSelection.has(noteId)),
        {
          anchorId: selectionAnchorIdRef.current ?? id,
          rangeEndId: id,
        },
      );
    },
    [getVisibleNoteIds, setSelectionState],
  );

  const selectNoteRange = useCallback(
    (id: string) => {
      const visibleNoteIds = getVisibleNoteIds();
      const targetIndex = visibleNoteIds.indexOf(id);
      if (targetIndex === -1) return;

      const anchorId =
        selectionAnchorIdRef.current ??
        selectedNoteIdRef.current ??
        selectedNoteIdsRef.current[0] ??
        id;
      const anchorIndex = visibleNoteIds.indexOf(anchorId);
      const normalizedAnchorIndex = anchorIndex === -1 ? targetIndex : anchorIndex;
      const start = Math.min(normalizedAnchorIndex, targetIndex);
      const end = Math.max(normalizedAnchorIndex, targetIndex);

      setSelectionState(visibleNoteIds.slice(start, end + 1), {
        anchorId:
          anchorIndex === -1
            ? visibleNoteIds[targetIndex]
            : visibleNoteIds[normalizedAnchorIndex],
        rangeEndId: id,
      });
    },
    [getVisibleNoteIds, setSelectionState],
  );

  const clearNoteSelection = useCallback(() => {
    collapseSelectionToActiveNote();
  }, [collapseSelectionToActiveNote]);

  const selectAllVisibleNotes = useCallback(() => {
    const visibleNoteIds = getVisibleNoteIds();
    if (visibleNoteIds.length === 0) {
      setSelectionState([], { anchorId: null, rangeEndId: null });
      return;
    }

    const activeNoteId = selectedNoteIdRef.current;
    const anchorId = activeNoteId && visibleNoteIds.includes(activeNoteId)
      ? activeNoteId
      : visibleNoteIds[0];

    setSelectionState(visibleNoteIds, {
      anchorId,
      rangeEndId: visibleNoteIds[visibleNoteIds.length - 1],
    });
  }, [getVisibleNoteIds, setSelectionState]);

  const reloadCurrentNote = useCallback(async () => {
    if (!selectedNoteIdRef.current) return;
    try {
      const note = await notesService.readNote(selectedNoteIdRef.current);
      setCurrentNote(note);
      setHasExternalChanges(false);
      setReloadVersion((v) => v + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reload note");
    }
  }, []);

  const createNote = useCallback(async () => {
    try {
      const targetFolder = selectedFolderPathRef.current ?? undefined;
      const note = await notesService.createNote(targetFolder);
      selectRequestIdRef.current += 1;
      pendingNewNoteIdRef.current = note.id;
      // Mark as recently saved to ignore file-change events from our own creation
      recentlySavedRef.current.add(note.id);
      await refreshNotes();
      setCurrentNote(note);
      setSelectedNoteId(note.id);
      setSelectionState([note.id], { anchorId: note.id, rangeEndId: note.id });
      const parentFolder = getParentFolderPath(note.id);
      if (selectedFolderPathRef.current !== null) {
        setSelectedFolderPath(parentFolder);
      }
      // Clear search when creating a new note
      setSearchQuery("");
      setSearchResults([]);
      setTimeout(() => {
        recentlySavedRef.current.delete(note.id);
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create note");
    }
  }, [refreshNotes, setSelectionState]);

  const consumePendingNewNote = useCallback((id: string) => {
    if (pendingNewNoteIdRef.current !== id) {
      pendingNewNoteIdRef.current = null;
      return false;
    }
    pendingNewNoteIdRef.current = null;
    return true;
  }, []);

  const saveNote = useCallback(
    async (content: string, noteId?: string) => {
      // Use provided noteId (for flush saves) or fall back to currentNote.id
      const savingNoteId = noteId || currentNote?.id;
      if (!savingNoteId) return;
      let updatedId: string | null = null;

      try {
        // Mark this note as recently saved to ignore file-change events from our own save
        recentlySavedRef.current.add(savingNoteId);

        const updated = await notesService.saveNote(savingNoteId, content);
        updatedId = updated.id;

        // If the note was renamed (ID changed), also mark the new ID
        if (updated.id !== savingNoteId) {
          recentlySavedRef.current.add(updated.id);

          // Transfer pin status to new ID
          await persistSettings((currentSettings) => {
            const pinnedIds = currentSettings.pinnedNoteIds || [];
            if (!pinnedIds.includes(savingNoteId)) {
              return currentSettings;
            }

            return {
              ...currentSettings,
              pinnedNoteIds: pinnedIds.map((id) =>
                id === savingNoteId ? updated.id : id,
              ),
            };
          });
        }

        // Clear external changes flag - if it was set by our own save, we want to ignore it
        setHasExternalChanges(false);

        // Only update state if we're still on the same note we started saving
        // This prevents race conditions when user switches notes during save
        setSelectedNoteId((prevId) => {
          if (prevId === savingNoteId) {
            // Update to the new ID if the note was renamed
            setCurrentNote(updated);
            return updated.id;
          }
          // User switched to a different note, don't update current note
          return prevId;
        });
        setSelectedNoteIds((prevIds) =>
          prevIds.map((id) => (id === savingNoteId ? updated.id : id)),
        );
        if (selectionAnchorIdRef.current === savingNoteId) {
          selectionAnchorIdRef.current = updated.id;
        }
        if (selectionRangeEndIdRef.current === savingNoteId) {
          selectionRangeEndIdRef.current = updated.id;
        }

        // Schedule refresh with debounce - avoids blocking typing during rapid saves
        scheduleRefresh();

        // Clear the recently saved flag after a short delay
        // (longer than the file watcher debounce of 500ms)
        setTimeout(() => {
          recentlySavedRef.current.delete(savingNoteId);
          if (updatedId) recentlySavedRef.current.delete(updatedId);
        }, 1000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save note");
        // Clean up immediately on error to avoid leaving stale entries
        recentlySavedRef.current.delete(savingNoteId);
        if (updatedId) recentlySavedRef.current.delete(updatedId);
      }
    },
    [currentNote, persistSettings, scheduleRefresh]
  );

  const deleteNote = useCallback(
    async (id: string) => {
      try {
        await notesService.deleteNote(id);

        // Clean up pinned status for deleted note
        const pinnedIds = settingsRef.current.pinnedNoteIds || [];
        if (pinnedIds.includes(id)) {
          await persistSettings((currentSettings) => ({
            ...currentSettings,
            pinnedNoteIds: (currentSettings.pinnedNoteIds || []).filter(
              (pinId) => pinId !== id,
            ),
          }));
        }

        // Only clear selection if we're deleting the currently selected note
        setSelectedNoteId((prevId) => {
          if (prevId === id) {
            setCurrentNote(null);
            return null;
          }
          return prevId;
        });
        setSelectedNoteIds((prevIds) => prevIds.filter((noteId) => noteId !== id));
        if (selectionAnchorIdRef.current === id) {
          selectionAnchorIdRef.current = selectedNoteIdRef.current === id ? null : selectedNoteIdRef.current;
        }
        if (selectionRangeEndIdRef.current === id) {
          selectionRangeEndIdRef.current = selectionAnchorIdRef.current;
        }
        await refreshNotes();
        await refreshActiveSearchResults();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete note");
      }
    },
    [persistSettings, refreshActiveSearchResults, refreshNotes]
  );

  const deleteSelectedNotes = useCallback(async () => {
    const noteIds = selectedNoteIdsRef.current;
    if (noteIds.length === 0) return;
    if (noteIds.length === 1) {
      await deleteNote(noteIds[0]);
      return;
    }

    try {
      await notesService.deleteNotes(noteIds);
      const deletedSet = new Set(noteIds);
      if (
        selectedNoteIdRef.current &&
        deletedSet.has(selectedNoteIdRef.current)
      ) {
        setSelectedNoteId(null);
        setCurrentNote(null);
      }
      setSelectionState([], {
        anchorId: selectedNoteIdRef.current,
        rangeEndId: selectedNoteIdRef.current,
      });
      await refreshSettings();
      await refreshNotes();
      await refreshActiveSearchResults();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete selected notes"
      );
      throw err;
    }
  }, [
    deleteNote,
    refreshActiveSearchResults,
    refreshNotes,
    refreshSettings,
    setSelectionState,
  ]);

  const duplicateNote = useCallback(
    async (id: string) => {
      try {
        const newNote = await notesService.duplicateNote(id);
        selectRequestIdRef.current += 1;
        // Mark as recently saved to ignore file-change events from our own creation
        recentlySavedRef.current.add(newNote.id);
        await refreshNotes();
        setCurrentNote(newNote);
        setSelectedNoteId(newNote.id);
        setSelectionState([newNote.id], {
          anchorId: newNote.id,
          rangeEndId: newNote.id,
        });
        const parentFolder = getParentFolderPath(newNote.id);
        if (selectedFolderPathRef.current !== null) {
          setSelectedFolderPath(parentFolder);
        }
        setTimeout(() => {
          recentlySavedRef.current.delete(newNote.id);
        }, 1000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to duplicate note");
      }
    },
    [refreshNotes, setSelectionState]
  );

  const pinNote = useCallback(
    async (id: string) => {
      try {
        const pinnedIds = settingsRef.current.pinnedNoteIds || [];

        if (!pinnedIds.includes(id)) {
          await persistSettings((currentSettings) => ({
            ...currentSettings,
            pinnedNoteIds: [...(currentSettings.pinnedNoteIds || []), id],
          }));
          await refreshNotes();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to pin note");
      }
    },
    [persistSettings, refreshNotes]
  );

  const unpinNote = useCallback(
    async (id: string) => {
      try {
        await persistSettings((currentSettings) => ({
          ...currentSettings,
          pinnedNoteIds: (currentSettings.pinnedNoteIds || []).filter(
            (pinId) => pinId !== id,
          ),
        }));
        await refreshNotes();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to unpin note");
      }
    },
    [persistSettings, refreshNotes]
  );

  const createNoteInFolder = useCallback(
    async (folderPath: string) => {
      try {
        const note = await notesService.createNote(folderPath);
        selectRequestIdRef.current += 1;
        pendingNewNoteIdRef.current = note.id;
        recentlySavedRef.current.add(note.id);
        await refreshNotes();
        setCurrentNote(note);
        setSelectedNoteId(note.id);
        setSelectionState([note.id], { anchorId: note.id, rangeEndId: note.id });
        setSelectedFolderPath(folderPath);
        setSearchQuery("");
        setSearchResults([]);
        setTimeout(() => {
          recentlySavedRef.current.delete(note.id);
        }, 1000);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to create note"
        );
      }
    },
    [refreshNotes, setSelectionState]
  );

  const createFolderAction = useCallback(
    async (parentPath: string, name: string) => {
      try {
        const fullPath = parentPath ? `${parentPath}/${name}` : name;
        await notesService.createFolder(fullPath);
        await refreshSettings();
        await refreshNotes();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to create folder"
        );
      }
    },
    [refreshNotes, refreshSettings]
  );

  const deleteFolderAction = useCallback(
    async (path: string) => {
      try {
        await notesService.deleteFolder(path);
        // If the selected note was inside the deleted folder, clear selection
        setSelectedNoteId((prevId) => {
          if (prevId && prevId.startsWith(path + "/")) {
            setCurrentNote(null);
            return null;
          }
          return prevId;
        });
        setSelectedNoteIds((prevIds) =>
          prevIds.filter((noteId) => !noteId.startsWith(path + "/")),
        );
        if (
          selectionAnchorIdRef.current &&
          selectionAnchorIdRef.current.startsWith(path + "/")
        ) {
          selectionAnchorIdRef.current = null;
        }
        if (
          selectionRangeEndIdRef.current &&
          selectionRangeEndIdRef.current.startsWith(path + "/")
        ) {
          selectionRangeEndIdRef.current = selectionAnchorIdRef.current;
        }
        setSelectedFolderPath((prevPath) => {
          if (!prevPath) return prevPath;
          if (prevPath === path || prevPath.startsWith(path + "/")) {
            return getParentPath(path);
          }
          return prevPath;
        });
        await refreshSettings();
        await refreshNotes();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to delete folder"
        );
      }
    },
    [refreshNotes, refreshSettings]
  );

  const renameFolderAction = useCallback(
    async (oldPath: string, newName: string) => {
      try {
        await notesService.renameFolder(oldPath, newName);

        // Compute new folder path
        const lastSlash = oldPath.lastIndexOf("/");
        const newPath =
          lastSlash >= 0
            ? `${oldPath.substring(0, lastSlash)}/${newName}`
            : newName;
        const oldPrefix = oldPath + "/";
        const newPrefix = newPath + "/";

        // Update selectedNoteId if it was inside the renamed folder
        setSelectedNoteId((prevId) => {
          if (prevId && prevId.startsWith(oldPrefix)) {
            const newId = newPrefix + prevId.substring(oldPrefix.length);
            notesService.readNote(newId).then((note) => {
              setCurrentNote(note);
            }).catch((err) => {
              setError(err instanceof Error ? err.message : "Failed to read renamed note");
            });
            return newId;
          }
          return prevId;
        });
        setSelectedNoteIds((prevIds) =>
          prevIds.map((id) =>
            id.startsWith(oldPrefix)
              ? newPrefix + id.substring(oldPrefix.length)
              : id,
          ),
        );
        if (
          selectionAnchorIdRef.current &&
          selectionAnchorIdRef.current.startsWith(oldPrefix)
        ) {
          selectionAnchorIdRef.current =
            newPrefix + selectionAnchorIdRef.current.substring(oldPrefix.length);
        }
        if (
          selectionRangeEndIdRef.current &&
          selectionRangeEndIdRef.current.startsWith(oldPrefix)
        ) {
          selectionRangeEndIdRef.current =
            newPrefix + selectionRangeEndIdRef.current.substring(oldPrefix.length);
        }
        setSelectedFolderPath((prevPath) => {
          if (!prevPath) return prevPath;
          if (prevPath === oldPath) return newPath;
          if (prevPath.startsWith(oldPrefix)) {
            return newPrefix + prevPath.substring(oldPrefix.length);
          }
          return prevPath;
        });
        await refreshSettings();
        await refreshNotes();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to rename folder"
        );
      }
    },
    [refreshNotes, refreshSettings]
  );

  const moveNoteAction = useCallback(
    async (id: string, targetFolder: string) => {
      try {
        const newId = await notesService.moveNote(id, targetFolder);
        // Update selection if we moved the selected note
        setSelectedNoteId((prevId) => {
          if (prevId === id) {
            notesService.readNote(newId).then((note) => {
              setCurrentNote(note);
            }).catch((err) => {
              setError(err instanceof Error ? err.message : "Failed to read moved note");
            });
            return newId;
          }
          return prevId;
        });
        setSelectedNoteIds((prevIds) =>
          prevIds.map((noteId) => (noteId === id ? newId : noteId)),
        );
        if (selectionAnchorIdRef.current === id) {
          selectionAnchorIdRef.current = newId;
        }
        if (selectionRangeEndIdRef.current === id) {
          selectionRangeEndIdRef.current = newId;
        }
        setSelectedFolderPath((prevPath) => {
          if (prevPath && getParentFolderPath(id) === prevPath) {
            return targetFolder || null;
          }
          return prevPath;
        });
        await refreshSettings();
        await refreshNotes();
        await refreshActiveSearchResults();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to move note");
      }
    },
    [refreshActiveSearchResults, refreshNotes, refreshSettings]
  );

  const moveSelectedNotes = useCallback(
    async (targetFolder: string) => {
      const noteIds = selectedNoteIdsRef.current;
      if (noteIds.length === 0) return;
      if (noteIds.length === 1) {
        await moveNoteAction(noteIds[0], targetFolder);
        return;
      }

      try {
        const moveResults = await notesService.moveNotes(noteIds, targetFolder);
        const moveMap = new Map(
          moveResults.map((result) => [result.from, result.to] as const),
        );

        if (
          selectedNoteIdRef.current &&
          moveMap.has(selectedNoteIdRef.current)
        ) {
          const nextActiveId = moveMap.get(selectedNoteIdRef.current) ?? selectedNoteIdRef.current;
          setSelectedNoteId(nextActiveId);
          if (nextActiveId !== selectedNoteIdRef.current) {
            try {
              const note = await notesService.readNote(nextActiveId);
              setCurrentNote(note);
            } catch (err) {
              setError(
                err instanceof Error ? err.message : "Failed to read moved note",
              );
            }
          }
        }

        const nextSelectedIds = noteIds.map((id) => moveMap.get(id) ?? id);
        setSelectionState(nextSelectedIds, {
          anchorId:
            (selectionAnchorIdRef.current &&
              moveMap.get(selectionAnchorIdRef.current)) ??
            selectionAnchorIdRef.current,
          rangeEndId:
            (selectionRangeEndIdRef.current &&
              moveMap.get(selectionRangeEndIdRef.current)) ??
            selectionRangeEndIdRef.current,
        });

        setSelectedFolderPath((prevPath) => {
          const activeId = selectedNoteIdRef.current;
          if (!prevPath || !activeId) return prevPath;
          if (getParentFolderPath(activeId) === prevPath) {
            return targetFolder || null;
          }
          return prevPath;
        });

        await refreshSettings();
        await refreshNotes();
        await refreshActiveSearchResults();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to move selected notes",
        );
        throw err;
      }
    },
    [moveNoteAction, refreshActiveSearchResults, refreshNotes, refreshSettings, setSelectionState],
  );

  const moveFolderAction = useCallback(
    async (path: string, targetParent: string) => {
      try {
        await notesService.moveFolder(path, targetParent);

        // Compute new folder path
        const folderName = path.includes("/")
          ? path.substring(path.lastIndexOf("/") + 1)
          : path;
        const newPath = targetParent
          ? `${targetParent}/${folderName}`
          : folderName;
        const oldPrefix = path + "/";
        const newPrefix = newPath + "/";

        // Update selectedNoteId if it was inside the moved folder
        setSelectedNoteId((prevId) => {
          if (prevId && prevId.startsWith(oldPrefix)) {
            const newId = newPrefix + prevId.substring(oldPrefix.length);
            notesService.readNote(newId).then((note) => {
              setCurrentNote(note);
            }).catch((err) => {
              setError(err instanceof Error ? err.message : "Failed to read moved note");
            });
            return newId;
          }
          return prevId;
        });
        setSelectedNoteIds((prevIds) =>
          prevIds.map((id) =>
            id.startsWith(oldPrefix)
              ? newPrefix + id.substring(oldPrefix.length)
              : id,
          ),
        );
        if (
          selectionAnchorIdRef.current &&
          selectionAnchorIdRef.current.startsWith(oldPrefix)
        ) {
          selectionAnchorIdRef.current =
            newPrefix + selectionAnchorIdRef.current.substring(oldPrefix.length);
        }
        if (
          selectionRangeEndIdRef.current &&
          selectionRangeEndIdRef.current.startsWith(oldPrefix)
        ) {
          selectionRangeEndIdRef.current =
            newPrefix + selectionRangeEndIdRef.current.substring(oldPrefix.length);
        }
        setSelectedFolderPath((prevPath) => {
          if (!prevPath) return prevPath;
          if (prevPath === path) return newPath;
          if (prevPath.startsWith(oldPrefix)) {
            return newPrefix + prevPath.substring(oldPrefix.length);
          }
          return prevPath;
        });
        await refreshSettings();
        await refreshNotes();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to move folder");
      }
    },
    [refreshNotes, refreshSettings]
  );

  const setFolderIcon = useCallback(async (path: string, iconName: string | null) => {
    if (!path) return;

    try {
      await persistSettings((currentSettings) => {
        const nextFolderIcons = sanitizeFolderIcons(currentSettings.folderIcons);

        if (iconName) {
          nextFolderIcons[path] = iconName;
        } else {
          delete nextFolderIcons[path];
        }

        return {
          ...currentSettings,
          folderIcons:
            Object.keys(nextFolderIcons).length > 0
              ? nextFolderIcons
              : undefined,
        };
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update folder icon"
      );
      throw err;
    }
  }, [persistSettings]);

  const setNotesFolder = useCallback(async (path: string) => {
    try {
      await notesService.setNotesFolder(path);
      setNotesFolderState(path);
      applySettings({});
      setSelectedFolderPath(null);
      setSelectedNoteId(null);
      setSelectionState([], { anchorId: null, rangeEndId: null });
      setCurrentNote(null);
      // Start file watcher after setting folder
      await notesService.startFileWatcher();
      await refreshSettings();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to set notes folder"
      );
    }
  }, [applySettings, refreshSettings, setSelectionState]);

  // Update local state only (backend already initialized the folder).
  // Used when the CLI sets the notes folder and emits an event.
  const syncNotesFolder = useCallback(async (path: string) => {
    try {
      setNotesFolderState(path);
      applySettings({});
      setSelectedFolderPath(null);
      setSelectedNoteId(null);
      setSelectionState([], { anchorId: null, rangeEndId: null });
      setCurrentNote(null);
      const notesList = await notesService.listNotes();
      setNotes(notesList);
      await notesService.startFileWatcher();
      await refreshSettings();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to sync notes folder"
      );
    }
  }, [applySettings, refreshSettings, setSelectionState]);

  const search = useCallback(async (query: string) => {
    const requestId = ++searchRequestIdRef.current;
    setSearchQuery(query);

    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const queryLower = trimmedQuery.toLowerCase();
    // Instant local results for responsive UX while full-text search runs.
    const instantResults: SearchResult[] = notesRef.current
      .map((note) => {
        const titleLower = note.title.toLowerCase();
        const previewLower = note.preview.toLowerCase();
        const titleStarts = titleLower.startsWith(queryLower);
        const titleIncludes = titleLower.includes(queryLower);
        const previewIncludes = previewLower.includes(queryLower);

        let score = 0;
        if (titleStarts) score += 4;
        if (titleIncludes) score += 2;
        if (previewIncludes) score += 1;

        return { note, score };
      })
      .filter(({ score }) => score > 0)
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }
        if (right.note.modified !== left.note.modified) {
          return right.note.modified - left.note.modified;
        }
        return left.note.title.localeCompare(right.note.title);
      })
      .slice(0, 20)
      .map(({ note, score }) => ({
        id: note.id,
        title: note.title,
        preview: note.preview,
        modified: note.modified,
        score,
      }));

    // Show instant local matches immediately; clear stale results if none match.
    setSearchResults(instantResults);

    setIsSearching(true);
    try {
      const results = await notesService.searchNotes(trimmedQuery);
      if (requestId !== searchRequestIdRef.current) return;
      if (results.length === 0) {
        // If neither backend nor instant matches found, clear results only now
        // (after async search settles) to avoid transient empty states.
        setSearchResults(instantResults);
      } else {
        // Merge backend + instant results, deduping by note id.
        const merged = [...results];
        const seen = new Set(results.map((result) => result.id));
        for (const result of instantResults) {
          if (!seen.has(result.id)) {
            merged.push(result);
          }
        }
        setSearchResults(merged);
      }
    } catch (err) {
      console.error("Search failed:", err);
    }
    if (requestId !== searchRequestIdRef.current) return;
    setIsSearching(false);
  }, []);

  const clearSearch = useCallback(() => {
    searchRequestIdRef.current += 1;
    setSearchQuery("");
    setSearchResults([]);
    setIsSearching(false);
  }, []);

  async function refreshActiveSearchResults() {
    const activeQuery = searchQueryRef.current.trim();
    if (!activeQuery) return;
    await search(activeQuery);
  }

  // Load initial state
  useEffect(() => {
    async function init() {
      try {
        const folder = await notesService.getNotesFolder();
        setNotesFolderState(folder);
        if (folder) {
          const notesList = await notesService.listNotes();
          setNotes(notesList);
          await refreshSettings();
          // Start file watcher
          await notesService.startFileWatcher();
        } else {
          applySettings({});
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to initialize");
      } finally {
        setIsLoading(false);
      }
    }
    init();
  }, [applySettings, refreshSettings]);

  // Listen for file change events and notify if current note changed externally
  useEffect(() => {
    let isCancelled = false;
    let unlisten: (() => void) | undefined;

    listen<FileChangeEventPayload>("file-change", (event) => {
      // Don't process if effect was cleaned up
      if (isCancelled) return;

      const changedIds = event.payload.changed_ids || [];

      // Filter out notes we recently saved ourselves
      const externalChanges = changedIds.filter(
        (id) => !recentlySavedRef.current.has(id)
      );

      // Only refresh if there are external changes
      if (externalChanges.length > 0) {
        refreshNotes();

        // If the currently selected note was changed externally, set flag (don't auto-reload)
        const currentId = selectedNoteIdRef.current;
        if (currentId && externalChanges.includes(currentId)) {
          setHasExternalChanges(true);
        }
      }
    }).then((fn) => {
      if (isCancelled) {
        // Effect was cleaned up before listener registered, clean up immediately
        fn();
      } else {
        unlisten = fn;
      }
    });

    return () => {
      isCancelled = true;
      if (unlisten) {
        unlisten();
      }
    };
  }, [refreshNotes]);

  useEffect(() => {
    const scheduleRefresh = () => {
      if (!notesFolder) return;

      if (windowRefreshTimeoutRef.current) {
        clearTimeout(windowRefreshTimeoutRef.current);
      }

      windowRefreshTimeoutRef.current = window.setTimeout(() => {
        windowRefreshTimeoutRef.current = null;
        void refreshNotes();
      }, 250);
    };

    const handleFocus = () => {
      scheduleRefresh();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        scheduleRefresh();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (windowRefreshTimeoutRef.current) {
        clearTimeout(windowRefreshTimeoutRef.current);
        windowRefreshTimeoutRef.current = null;
      }
    };
  }, [notesFolder, refreshNotes]);

  // Listen for "select-note" events from the backend (CLI, drag-drop, Open With, import from preview)
  useEffect(() => {
    const unlisten = listen<string>("select-note", (event) => {
      // Refresh the notes list so the sidebar shows the new note immediately
      refreshNotes();
      selectNote(event.payload);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [selectNote, refreshNotes]);

  // Refresh notes when folder changes
  useEffect(() => {
    if (notesFolder) {
      refreshNotes();
    }
  }, [notesFolder, refreshNotes]);

  const scopedNotes = useMemo(() => {
    if (selectedFolderPath === null) {
      return notes;
    }

    return notes.filter(
      (note) => getParentFolderPath(note.id) === selectedFolderPath,
    );
  }, [notes, selectedFolderPath]);

  useEffect(() => {
    const visibleNoteIds = getVisibleNoteIds();
    const visibleNoteIdSet = new Set(visibleNoteIds);

    setSelectedNoteIds((prevIds) => {
      const filteredIds = prevIds.filter((id) => visibleNoteIdSet.has(id));
      const orderedIds = visibleNoteIds.filter((id) => filteredIds.includes(id));

      if (orderedIds.length === 0) {
        const activeNoteId = selectedNoteIdRef.current;
        if (activeNoteId && visibleNoteIdSet.has(activeNoteId)) {
          return [activeNoteId];
        }
      }

      if (
        prevIds.length === orderedIds.length &&
        prevIds.every((id, index) => id === orderedIds[index])
      ) {
        return prevIds;
      }

      return orderedIds;
    });

    if (
      selectionAnchorIdRef.current &&
      !visibleNoteIdSet.has(selectionAnchorIdRef.current)
    ) {
      selectionAnchorIdRef.current =
        (selectedNoteIdRef.current &&
          visibleNoteIdSet.has(selectedNoteIdRef.current)
          ? selectedNoteIdRef.current
          : visibleNoteIds[0]) ?? null;
    }

    if (
      selectionRangeEndIdRef.current &&
      !visibleNoteIdSet.has(selectionRangeEndIdRef.current)
    ) {
      selectionRangeEndIdRef.current = selectionAnchorIdRef.current;
    }
  }, [
    getVisibleNoteIds,
    notes,
    searchQuery,
    searchResults,
    selectedFolderPath,
    selectedNoteId,
  ]);

  // Memoize data context value to prevent unnecessary re-renders
  const dataValue = useMemo<NotesDataContextValue>(
    () => ({
      notes,
      scopedNotes,
      settings,
      folderIcons,
      noteSortMode: settings.noteSortMode || DEFAULT_NOTE_SORT_MODE,
      folderSortMode: settings.folderSortMode || DEFAULT_FOLDER_SORT_MODE,
      folderManualOrder: settings.folderManualOrder || {},
      selectedNoteId,
      selectedNoteIds,
      selectedFolderPath,
      currentNote,
      notesFolder,
      isLoading,
      error,
      searchQuery,
      searchResults,
      isSearching,
      hasExternalChanges,
      reloadVersion,
    }),
    [
      notes,
      scopedNotes,
      settings,
      folderIcons,
      selectedNoteId,
      selectedNoteIds,
      selectedFolderPath,
      currentNote,
      notesFolder,
      isLoading,
      error,
      searchQuery,
      searchResults,
      isSearching,
      hasExternalChanges,
      reloadVersion,
    ]
  );

  // Memoize actions context value - these are stable callbacks
  const actionsValue = useMemo<NotesActionsContextValue>(
    () => ({
      selectNote,
      toggleNoteSelection,
      selectNoteRange,
      clearNoteSelection,
      selectAllVisibleNotes,
      selectFolder,
      createNote,
      consumePendingNewNote,
      saveNote,
      deleteNote,
      deleteSelectedNotes,
      duplicateNote,
      refreshNotes,
      reloadCurrentNote,
      setNotesFolder,
      syncNotesFolder,
      search,
      clearSearch,
      pinNote,
      unpinNote,
      createNoteInFolder,
      createFolder: createFolderAction,
      deleteFolder: deleteFolderAction,
      renameFolder: renameFolderAction,
      moveNote: moveNoteAction,
      moveSelectedNotes,
      moveFolder: moveFolderAction,
      setFolderIcon,
      setCollapsedFolders,
      setNoteSortMode,
      setFolderSortMode,
      setFolderManualOrder,
    }),
    [
      selectNote,
      toggleNoteSelection,
      selectNoteRange,
      clearNoteSelection,
      selectAllVisibleNotes,
      selectFolder,
      createNote,
      consumePendingNewNote,
      saveNote,
      deleteNote,
      deleteSelectedNotes,
      duplicateNote,
      refreshNotes,
      reloadCurrentNote,
      setNotesFolder,
      syncNotesFolder,
      search,
      clearSearch,
      pinNote,
      unpinNote,
      createNoteInFolder,
      createFolderAction,
      deleteFolderAction,
      renameFolderAction,
      moveNoteAction,
      moveSelectedNotes,
      moveFolderAction,
      setFolderIcon,
      setCollapsedFolders,
      setNoteSortMode,
      setFolderSortMode,
      setFolderManualOrder,
    ]
  );

  return (
    <NotesActionsContext.Provider value={actionsValue}>
      <NotesDataContext.Provider value={dataValue}>
        {children}
      </NotesDataContext.Provider>
    </NotesActionsContext.Provider>
  );
}

// Hook to get notes data (subscribes to data changes)
export function useNotesData() {
  const context = useContext(NotesDataContext);
  if (!context) {
    throw new Error("useNotesData must be used within a NotesProvider");
  }
  return context;
}

// Hook to get notes actions (stable references, rarely causes re-renders)
export function useNotesActions() {
  const context = useContext(NotesActionsContext);
  if (!context) {
    throw new Error("useNotesActions must be used within a NotesProvider");
  }
  return context;
}

// Combined hook for convenience (backward compatible)
export function useNotes() {
  const data = useNotesData();
  const actions = useNotesActions();
  return { ...data, ...actions };
}

// Optional hook that returns null when outside a NotesProvider (for preview mode)
export function useOptionalNotes() {
  const data = useContext(NotesDataContext);
  const actions = useContext(NotesActionsContext);
  if (!data || !actions) return null;
  return { ...data, ...actions };
}

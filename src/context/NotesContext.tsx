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
  type FolderAppearance,
  type FolderSortMode,
  type Note,
  type NoteListDateMode,
  type NoteListPreviewLines,
  type NoteMetadata,
  type NoteScope,
  type NoteSortMode,
  type Settings,
  type SettingsPatch,
} from "../types/note";
import * as notesService from "../services/notes";
import type {
  FileChangeEventPayload,
  SearchResult,
} from "../services/notes";
import {
  sanitizeFolderAppearances,
  type FolderAppearanceMap,
} from "../lib/folderIcons";
import { rewriteFolderPathList } from "../lib/folderTree";
import { markNoteOpenTiming, startNoteOpenTiming } from "../lib/noteOpenTiming";

interface FolderRevealRequest {
  path: string;
  version: number;
}

// Separate contexts to prevent unnecessary re-renders
// Data context: changes frequently, only subscribed by components that need the data
interface NotesDataContextValue {
  notes: NoteMetadata[];
  scopedNotes: NoteMetadata[];
  pinnedNotes: NoteMetadata[];
  recentNotes: NoteMetadata[];
  knownFolders: string[];
  hasLoadedFolders: boolean;
  showPinnedNotes: boolean;
  showRecentNotes: boolean;
  showNoteCounts: boolean;
  showNotesFromSubfolders: boolean;
  noteListDateMode: NoteListDateMode;
  noteListPreviewLines: 0 | NoteListPreviewLines;
  showNoteListFilename: boolean;
  showNoteListFolderPath: boolean;
  showNoteListPreview: boolean;
  settings: Settings;
  folderAppearances: FolderAppearanceMap;
  noteSortMode: NoteSortMode;
  folderSortMode: FolderSortMode;
  selectedScope: NoteScope;
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
  folderRevealRequest: FolderRevealRequest | null;
}

// Actions context: stable references, rarely causes re-renders
interface NotesActionsContextValue {
  selectNote: (id: string) => Promise<void>;
  toggleNoteSelection: (id: string) => void;
  selectNoteRange: (id: string) => void;
  clearNoteSelection: () => void;
  selectAllVisibleNotes: () => void;
  selectFolder: (path: string | null) => void;
  selectPinnedNotes: () => void;
  selectRecentNotes: () => void;
  createNote: () => Promise<void>;
  consumePendingNewNote: (id: string) => boolean;
  saveNote: (content: string, noteId?: string) => Promise<void>;
  renameNote: (id: string, newName: string) => Promise<Note>;
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
  revealFolder: (path: string | null) => void;
  moveNote: (id: string, targetFolder: string) => Promise<void>;
  moveSelectedNotes: (targetFolder: string) => Promise<void>;
  moveFolder: (path: string, targetParent: string) => Promise<void>;
  setFolderAppearance: (
    path: string,
    appearance: FolderAppearance | null,
  ) => Promise<void>;
  setCollapsedFolders: (paths: string[]) => Promise<void>;
  setNoteSortMode: (mode: NoteSortMode) => Promise<void>;
  setNoteListViewOptions: (options: {
    noteListDateMode?: NoteListDateMode;
    noteListPreviewLines?: 0 | NoteListPreviewLines;
    showNoteCounts?: boolean;
    showNotesFromSubfolders?: boolean;
    showNoteListFilename?: boolean;
    showNoteListFolderPath?: boolean;
    showNoteListPreview?: boolean;
  }) => Promise<void>;
  setFolderSortMode: (mode: FolderSortMode) => Promise<void>;
  setShowPinnedNotes: (showPinnedNotes: boolean) => Promise<void>;
  setShowRecentNotes: (showRecentNotes: boolean) => Promise<void>;
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

const RECENT_NOTES_LIMIT = 5;
const DEFAULT_SETTINGS: Settings = {
  schemaVersion: 1,
  showNoteCounts: true,
  showNotesFromSubfolders: false,
  noteListDateMode: "modified",
  showNoteListFilename: true,
  showNoteListFolderPath: false,
  showNoteListPreview: true,
  noteListPreviewLines: 2,
  noteSortMode: DEFAULT_NOTE_SORT_MODE,
  folderSortMode: DEFAULT_FOLDER_SORT_MODE,
};

function normalizeNoteIds(
  noteIds: Array<string | null | undefined> | null | undefined,
): string[] {
  return Array.from(
    new Set(
      (noteIds ?? []).filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0,
      ),
    ),
  );
}

function sanitizeRecentNoteIds(
  recentNoteIds: string[] | null | undefined,
): string[] | undefined {
  if (recentNoteIds === undefined || recentNoteIds === null) {
    return undefined;
  }

  const normalizedIds = normalizeNoteIds(recentNoteIds).slice(
    0,
    RECENT_NOTES_LIMIT,
  );
  return normalizedIds.length > 0 ? normalizedIds : undefined;
}

function areNoteIdListsEqual(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((id, index) => id === right[index])
  );
}

function areNoteMetadataListsEqual(
  left: NoteMetadata[],
  right: NoteMetadata[],
) {
  return (
    left.length === right.length &&
    left.every((note, index) => {
      const other = right[index];
      return (
        other !== undefined &&
        note.id === other.id &&
        note.title === other.title &&
        note.preview === other.preview &&
        note.modified === other.modified &&
        note.created === other.created
      );
    })
  );
}

function haveSameNoteIdMembers(
  left: string[] | null | undefined,
  right: string[] | null | undefined,
) {
  const normalizedLeft = sanitizeRecentNoteIds(left) ?? [];
  const normalizedRight = sanitizeRecentNoteIds(right) ?? [];

  if (normalizedLeft.length !== normalizedRight.length) {
    return false;
  }

  const rightSet = new Set(normalizedRight);
  return normalizedLeft.every((id) => rightSet.has(id));
}

function getFolderPathFromScope(scope: NoteScope): string | null {
  return scope.type === "folder" ? scope.path : null;
}

function isNoteInFolderScope(
  noteId: string,
  folderPath: string,
  showNotesFromSubfolders = false,
): boolean {
  const parentPath = getParentFolderPath(noteId);
  if (parentPath === folderPath) {
    return true;
  }

  return Boolean(
    showNotesFromSubfolders &&
      parentPath?.startsWith(`${folderPath}/`),
  );
}

function noteSortValueCompare(
  left: number,
  right: number,
  descending: boolean,
): number {
  return descending ? right - left : left - right;
}

function compareNoteMetadata(
  left: NoteMetadata,
  right: NoteMetadata,
  noteSortMode: NoteSortMode,
): number {
  const ordering = (() => {
    switch (noteSortMode) {
      case "modifiedDesc":
        return noteSortValueCompare(left.modified, right.modified, true);
      case "modifiedAsc":
        return noteSortValueCompare(left.modified, right.modified, false);
      case "createdDesc":
        return noteSortValueCompare(left.created, right.created, true);
      case "createdAsc":
        return noteSortValueCompare(left.created, right.created, false);
      case "titleAsc": {
        const lowerTitleOrder = left.title
          .toLocaleLowerCase()
          .localeCompare(right.title.toLocaleLowerCase());
        return lowerTitleOrder || left.title.localeCompare(right.title);
      }
      case "titleDesc": {
        const lowerTitleOrder = right.title
          .toLocaleLowerCase()
          .localeCompare(left.title.toLocaleLowerCase());
        return lowerTitleOrder || right.title.localeCompare(left.title);
      }
    }
  })();

  return (
    ordering ||
    right.modified - left.modified ||
    left.id.localeCompare(right.id)
  );
}

function sortNoteMetadataList(
  notes: NoteMetadata[],
  pinnedNoteIds: string[] | null | undefined,
  noteSortMode: NoteSortMode,
): NoteMetadata[] {
  const pinnedIdSet = new Set(normalizeNoteIds(pinnedNoteIds));

  return [...notes].sort((left, right) => {
    const leftPinned = pinnedIdSet.has(left.id);
    const rightPinned = pinnedIdSet.has(right.id);

    if (leftPinned !== rightPinned) {
      return leftPinned ? -1 : 1;
    }

    return compareNoteMetadata(left, right, noteSortMode);
  });
}

function getEffectiveNoteSortMode(
  scope: NoteScope,
  settings: Settings,
): NoteSortMode {
  const workspaceNoteSortMode = settings.noteSortMode ?? DEFAULT_NOTE_SORT_MODE;

  if (scope.type !== "folder") {
    return workspaceNoteSortMode;
  }

  return (
    settings.folderNoteSortModes?.[scope.path] ??
    workspaceNoteSortMode
  );
}

function getScopedNotes(
  notes: NoteMetadata[],
  scope: NoteScope,
  recentNoteIds: string[] | null | undefined,
  showNotesFromSubfolders = false,
  pinnedNoteIds?: string[] | null,
  noteSortMode: NoteSortMode = DEFAULT_NOTE_SORT_MODE,
): NoteMetadata[] {
  if (scope.type === "all") {
    return sortNoteMetadataList(
      showNotesFromSubfolders
        ? notes
        : notes.filter((note) => getParentFolderPath(note.id) === null),
      pinnedNoteIds,
      noteSortMode,
    );
  }

  if (scope.type === "pinned") {
    const pinnedIdSet = new Set(normalizeNoteIds(pinnedNoteIds));
    if (pinnedIdSet.size === 0) return [];

    return sortNoteMetadataList(
      notes.filter((note) => pinnedIdSet.has(note.id)),
      pinnedNoteIds,
      noteSortMode,
    );
  }

  if (scope.type === "recent") {
    const recentSet = sanitizeRecentNoteIds(recentNoteIds) ?? [];
    if (recentSet.length === 0) return [];

    const notesById = new Map(notes.map((note) => [note.id, note] as const));
    return recentSet
      .map((noteId) => notesById.get(noteId) ?? null)
      .filter((note): note is NoteMetadata => note !== null);
  }

  return sortNoteMetadataList(
    notes.filter((note) =>
      isNoteInFolderScope(note.id, scope.path, showNotesFromSubfolders),
    ),
    pinnedNoteIds,
    noteSortMode,
  );
}

function prependRecentNoteId(
  recentNoteIds: string[] | null | undefined,
  noteId: string,
): string[] {
  return sanitizeRecentNoteIds([noteId, ...(recentNoteIds ?? [])]) ?? [];
}

function replaceNoteIds(
  noteIds: string[] | null | undefined,
  replacements: Map<string, string>,
): string[] {
  return normalizeNoteIds(
    (noteIds ?? []).map((noteId) => replacements.get(noteId) ?? noteId),
  );
}

function removeNoteIds(
  noteIds: string[] | null | undefined,
  idsToRemove: Set<string>,
): string[] {
  return normalizeNoteIds(
    (noteIds ?? []).filter((noteId) => !idsToRemove.has(noteId)),
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

function areSettingValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    if (left.length !== right.length) return false;

    return left.every((item, index) => areSettingValuesEqual(item, right[index]));
  }

  if (
    left &&
    right &&
    typeof left === "object" &&
    typeof right === "object"
  ) {
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const leftKeys = Object.keys(leftRecord);
    const rightKeys = Object.keys(rightRecord);

    if (leftKeys.length !== rightKeys.length) return false;

    return leftKeys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(rightRecord, key) &&
        areSettingValuesEqual(leftRecord[key], rightRecord[key]),
    );
  }

  return false;
}

function buildSettingsPatch(current: Settings, next: Settings): SettingsPatch {
  const patch: SettingsPatch = {};
  const patchRecord = patch as Record<string, unknown>;

  const assignNullableField = (
    key: keyof SettingsPatch,
    currentValue: unknown,
    nextValue: unknown,
  ) => {
    if (areSettingValuesEqual(currentValue, nextValue)) return;
    patchRecord[key] = nextValue === undefined ? null : nextValue;
  };

  const assignField = (
    key: keyof SettingsPatch,
    currentValue: unknown,
    nextValue: unknown,
  ) => {
    if (areSettingValuesEqual(currentValue, nextValue)) return;
    patchRecord[key] = nextValue;
  };

  assignNullableField("pinnedNoteIds", current.pinnedNoteIds, next.pinnedNoteIds);
  assignNullableField("recentNoteIds", current.recentNoteIds, next.recentNoteIds);
  assignField("showPinnedNotes", current.showPinnedNotes, next.showPinnedNotes);
  assignField("showRecentNotes", current.showRecentNotes, next.showRecentNotes);
  assignField("showNoteCounts", current.showNoteCounts, next.showNoteCounts);
  assignField(
    "showNotesFromSubfolders",
    current.showNotesFromSubfolders,
    next.showNotesFromSubfolders,
  );
  assignNullableField("defaultNoteName", current.defaultNoteName, next.defaultNoteName);
  assignNullableField("ollamaModel", current.ollamaModel, next.ollamaModel);
  assignNullableField("folderIcons", current.folderIcons, next.folderIcons);
  assignNullableField(
    "folderNoteSortModes",
    current.folderNoteSortModes,
    next.folderNoteSortModes,
  );
  assignNullableField(
    "collapsedFolders",
    current.collapsedFolders,
    next.collapsedFolders,
  );
  assignField("noteListDateMode", current.noteListDateMode, next.noteListDateMode);
  assignField(
    "showNoteListFilename",
    current.showNoteListFilename,
    next.showNoteListFilename,
  );
  assignField(
    "showNoteListFolderPath",
    current.showNoteListFolderPath,
    next.showNoteListFolderPath,
  );
  assignField(
    "showNoteListPreview",
    current.showNoteListPreview,
    next.showNoteListPreview,
  );
  assignField(
    "noteListPreviewLines",
    current.noteListPreviewLines,
    next.noteListPreviewLines,
  );
  assignField("noteSortMode", current.noteSortMode, next.noteSortMode);
  assignField("folderSortMode", current.folderSortMode, next.folderSortMode);

  return patch;
}

function isSettingsPatchEmpty(patch: SettingsPatch): boolean {
  return Object.keys(patch).length === 0;
}

export function NotesProvider({ children }: { children: ReactNode }) {
  const [notes, setNotes] = useState<NoteMetadata[]>([]);
  const [knownFolders, setKnownFolders] = useState<string[]>([]);
  const [hasLoadedFolders, setHasLoadedFolders] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [recentScopeNoteIds, setRecentScopeNoteIds] = useState<
    string[] | undefined
  >(undefined);
  const [folderAppearances, setFolderAppearances] =
    useState<FolderAppearanceMap>({});
  const [selectedScope, setSelectedScope] = useState<NoteScope>({ type: "all" });
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
  const [folderRevealRequest, setFolderRevealRequest] =
    useState<FolderRevealRequest | null>(null);

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
  const selectedScopeRef = useRef<NoteScope>(selectedScope);
  selectedScopeRef.current = selectedScope;
  const selectionAnchorIdRef = useRef<string | null>(null);
  const selectionRangeEndIdRef = useRef<string | null>(null);
  // Per-note save sequence counter to discard out-of-order save completions.
  const saveSequenceRef = useRef<Map<string, number>>(new Map());
  // Monotonic counter to ignore stale async note selection responses.
  const selectRequestIdRef = useRef(0);
  // Monotonic counter to ignore stale async search responses
  const searchRequestIdRef = useRef(0);
  // Tracks the ID of a newly created note so Editor can focus its title.
  const pendingNewNoteIdRef = useRef<string | null>(null);
  const noteIdRedirectsRef = useRef<Map<string, string>>(new Map());
  const settingsRef = useRef<Settings>(settings);
  settingsRef.current = settings;
  const windowRefreshTimeoutRef = useRef<number | null>(null);
  const folderLoadRequestIdRef = useRef(0);
  const folderRevealVersionRef = useRef(0);
  const selectedFolderPath = getFolderPathFromScope(selectedScope);
  const showPinnedNotes = settings.showPinnedNotes ?? true;
  const showRecentNotes = settings.showRecentNotes ?? true;
  const showNoteCounts = settings.showNoteCounts ?? true;
  const showNotesFromSubfolders = settings.showNotesFromSubfolders ?? false;
  const effectiveNoteSortMode = getEffectiveNoteSortMode(selectedScope, settings);
  const noteListDateMode = settings.noteListDateMode ?? "modified";
  const noteListPreviewLines =
    settings.showNoteListPreview === false
      ? 0
      : settings.noteListPreviewLines ?? 2;
  const showNoteListFilename = settings.showNoteListFilename ?? true;
  const showNoteListFolderPath = settings.showNoteListFolderPath ?? false;
  const showNoteListPreview = settings.showNoteListPreview ?? true;

  const refreshNotes = useCallback(async () => {
    if (!notesFolder) return;
    try {
      const notesList = await notesService.listNotes();
      if (noteIdRedirectsRef.current.size > 0) {
        const liveIds = new Set(notesList.map((note) => note.id));
        for (const redirectedFromId of noteIdRedirectsRef.current.keys()) {
          if (liveIds.has(redirectedFromId)) {
            noteIdRedirectsRef.current.delete(redirectedFromId);
          }
        }
      }
      if (!areNoteMetadataListsEqual(notesRef.current, notesList)) {
        notesRef.current = notesList;
        setNotes(notesList);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load notes");
    }
  }, [notesFolder]);

  const refreshKnownFolders = useCallback(async (
    targetNotesFolder: string | null = notesFolder,
  ) => {
    if (!targetNotesFolder) {
      folderLoadRequestIdRef.current += 1;
      setKnownFolders([]);
      setHasLoadedFolders(true);
      return;
    }

    const requestId = ++folderLoadRequestIdRef.current;
    setHasLoadedFolders(false);

    try {
      const folders = await notesService.listFolders();
      if (requestId !== folderLoadRequestIdRef.current) {
        return;
      }
      setKnownFolders(folders);
    } catch {
      if (requestId !== folderLoadRequestIdRef.current) {
        return;
      }
      setKnownFolders([]);
    } finally {
      if (requestId === folderLoadRequestIdRef.current) {
        setHasLoadedFolders(true);
      }
    }
  }, [notesFolder]);

  const revealFolder = useCallback((path: string | null) => {
    if (!path) {
      return;
    }

    folderRevealVersionRef.current += 1;
    setFolderRevealRequest({
      path,
      version: folderRevealVersionRef.current,
    });
  }, []);

  const applySettings = useCallback((nextSettings: Settings) => {
    settingsRef.current = nextSettings;
    setSettings(nextSettings);
    const nextFolderAppearances = sanitizeFolderAppearances(
      nextSettings.folderIcons ?? undefined,
    );
    setFolderAppearances(nextFolderAppearances);
    return nextSettings;
  }, []);

  const refreshRecentScopeNoteIds = useCallback(
    (nextRecentNoteIds: string[] | null | undefined) => {
      const normalizedRecentNoteIds = sanitizeRecentNoteIds(nextRecentNoteIds);

      setRecentScopeNoteIds((currentRecentNoteIds) => {
        const currentIds = currentRecentNoteIds ?? [];
        const nextIds = normalizedRecentNoteIds ?? [];

        if (areNoteIdListsEqual(currentIds, nextIds)) {
          return currentRecentNoteIds;
        }

        return normalizedRecentNoteIds;
      });
    },
    [],
  );

  const refreshSettings = useCallback(async () => {
      const nextSettings = await notesService.getSettings();
      const appliedSettings = applySettings(nextSettings);
      refreshRecentScopeNoteIds(appliedSettings.recentNoteIds);
      return appliedSettings;
    }, [applySettings, refreshRecentScopeNoteIds]);

  const persistSettings = useCallback(
    async (updater: (currentSettings: Settings) => Settings) => {
      const currentSettings = settingsRef.current;
      const nextSettings = updater(currentSettings);
      const patch = buildSettingsPatch(currentSettings, nextSettings);

      if (!isSettingsPatchEmpty(patch)) {
        await notesService.patchSettings(patch);
      }

      const appliedSettings = applySettings(nextSettings);

      if (
        selectedScopeRef.current.type === "recent" &&
        !haveSameNoteIdMembers(
          recentScopeNoteIds,
          appliedSettings.recentNoteIds,
        )
      ) {
        refreshRecentScopeNoteIds(appliedSettings.recentNoteIds);
      }

      return appliedSettings;
    },
    [applySettings, recentScopeNoteIds, refreshRecentScopeNoteIds],
  );

  const getVisibleNoteIds = useCallback(() => {
    if (searchQueryRef.current.trim()) {
      return searchResultsRef.current.map((result) => result.id);
    }

    const visibleRecentNoteIds =
      selectedScopeRef.current.type === "recent"
        ? recentScopeNoteIds
        : settingsRef.current.recentNoteIds;

    const visibleNoteSortMode = getEffectiveNoteSortMode(
      selectedScopeRef.current,
      settingsRef.current,
    );

    return getScopedNotes(
      notesRef.current,
      selectedScopeRef.current,
      visibleRecentNoteIds,
      settingsRef.current.showNotesFromSubfolders ?? false,
      settingsRef.current.pinnedNoteIds,
      visibleNoteSortMode,
    ).map((note) => note.id);
  }, [recentScopeNoteIds]);

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
      if (selectedScopeRef.current.type === "folder") {
        const selectedPath = selectedScopeRef.current.path;
        await persistSettings((currentSettings) => ({
          ...currentSettings,
          folderNoteSortModes: {
            ...(currentSettings.folderNoteSortModes ?? {}),
            [selectedPath]: mode,
          },
        }));
        return;
      }

      await persistSettings((currentSettings) => ({
        ...currentSettings,
        noteSortMode: mode,
      }));
      await refreshNotes();
    },
    [persistSettings, refreshNotes],
  );

  const setNoteListViewOptions = useCallback(
    async ({
      noteListDateMode,
      noteListPreviewLines,
      showNoteCounts,
      showNotesFromSubfolders,
      showNoteListFilename,
      showNoteListFolderPath,
      showNoteListPreview,
    }: {
      noteListDateMode?: NoteListDateMode;
      noteListPreviewLines?: 0 | NoteListPreviewLines;
      showNoteCounts?: boolean;
      showNotesFromSubfolders?: boolean;
      showNoteListFilename?: boolean;
      showNoteListFolderPath?: boolean;
      showNoteListPreview?: boolean;
    }) => {
      await persistSettings((currentSettings) => {
        const nextSettings: Settings = { ...currentSettings };

        if (noteListDateMode !== undefined) {
          nextSettings.noteListDateMode = noteListDateMode;
        }

        if (showNoteCounts !== undefined) {
          nextSettings.showNoteCounts = showNoteCounts;
        }

        if (showNotesFromSubfolders !== undefined) {
          nextSettings.showNotesFromSubfolders = showNotesFromSubfolders;
        }

        if (noteListPreviewLines !== undefined) {
          nextSettings.showNoteListPreview = noteListPreviewLines !== 0;
          if (noteListPreviewLines === 0) {
            nextSettings.noteListPreviewLines =
              currentSettings.noteListPreviewLines;
          } else {
            nextSettings.noteListPreviewLines = noteListPreviewLines;
          }
        }

        if (showNoteListFilename !== undefined) {
          nextSettings.showNoteListFilename = showNoteListFilename;
        }

        if (showNoteListFolderPath !== undefined) {
          nextSettings.showNoteListFolderPath = showNoteListFolderPath;
        }

        if (showNoteListPreview !== undefined) {
          nextSettings.showNoteListPreview = showNoteListPreview;
        }

        return nextSettings;
      });
    },
    [persistSettings],
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

  const setShowPinnedNotes = useCallback(
    async (showPinnedNotes: boolean) => {
      await persistSettings((currentSettings) => ({
        ...currentSettings,
        showPinnedNotes,
      }));
      setSelectedScope((prevScope) =>
        !showPinnedNotes && prevScope.type === "pinned"
          ? { type: "all" }
          : prevScope,
      );
    },
    [persistSettings],
  );

  const setShowRecentNotes = useCallback(
    async (showRecentNotes: boolean) => {
      await persistSettings((currentSettings) => ({
        ...currentSettings,
        showRecentNotes,
      }));
      setSelectedScope((prevScope) =>
        !showRecentNotes && prevScope.type === "recent"
          ? { type: "all" }
          : prevScope,
      );
    },
    [persistSettings],
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

  const selectScope = useCallback(
    (scope: NoteScope) => {
      const scopedRecentNoteIds =
        scope.type === "recent"
          ? sanitizeRecentNoteIds(settingsRef.current.recentNoteIds)
          : settingsRef.current.recentNoteIds;
      const includeSubfolders =
        settingsRef.current.showNotesFromSubfolders ?? false;
      const noteSortMode = getEffectiveNoteSortMode(scope, settingsRef.current);

      if (scope.type === "recent") {
        refreshRecentScopeNoteIds(scopedRecentNoteIds);
      }

      setSelectedScope(scope);

      const activeNoteId = selectedNoteIdRef.current;
      if (scope.type !== "all" && activeNoteId) {
        const visibleNoteIds = new Set(
          getScopedNotes(
            notesRef.current,
            scope,
            scopedRecentNoteIds,
            includeSubfolders,
            settingsRef.current.pinnedNoteIds,
            noteSortMode,
          ).map((note) => note.id),
        );
        if (!visibleNoteIds.has(activeNoteId)) {
          setSelectedNoteId(null);
          setSelectionState([], { anchorId: null, rangeEndId: null });
          setCurrentNote(null);
        }
      }
    },
    [refreshRecentScopeNoteIds, setSelectionState],
  );

  const selectFolder = useCallback(
    (path: string | null) => {
      if (path) {
        revealFolder(path);
      }
      selectScope(path ? { type: "folder", path } : { type: "all" });
    },
    [revealFolder, selectScope],
  );

  const selectRecentNotes = useCallback(() => {
    selectScope({ type: "recent" });
  }, [selectScope]);

  const selectPinnedNotes = useCallback(() => {
    selectScope({ type: "pinned" });
  }, [selectScope]);

  const updateRecentNoteIds = useCallback(
    async (updater: (currentRecentNoteIds: string[]) => string[]) => {
      const currentRecentNoteIds = settingsRef.current.recentNoteIds ?? [];
      const nextRecentNoteIds = sanitizeRecentNoteIds(
        updater(currentRecentNoteIds),
      ) ?? [];

      if (areNoteIdListsEqual(currentRecentNoteIds, nextRecentNoteIds)) {
        return;
      }

      await persistSettings((currentSettings) => ({
        ...currentSettings,
        recentNoteIds:
          nextRecentNoteIds.length > 0 ? nextRecentNoteIds : undefined,
      }));
    },
    [persistSettings],
  );

  const recordRecentNoteView = useCallback(
    async (noteId: string) => {
      try {
        await updateRecentNoteIds((currentRecentNoteIds) =>
          prependRecentNoteId(currentRecentNoteIds, noteId),
        );
      } catch (error) {
        console.error("Failed to update recent notes:", error);
      }
    },
    [updateRecentNoteIds],
  );

  const resolveLiveNoteId = useCallback((id: string) => {
    let resolvedId = id;
    const seen = new Set<string>();

    while (!seen.has(resolvedId)) {
      seen.add(resolvedId);
      const redirectedId = noteIdRedirectsRef.current.get(resolvedId);
      if (!redirectedId) {
        break;
      }
      resolvedId = redirectedId;
    }

    return resolvedId;
  }, []);

  const selectNote = useCallback(async (id: string) => {
    const resolvedId = resolveLiveNoteId(id);
    const requestId = ++selectRequestIdRef.current;
    try {
      startNoteOpenTiming(resolvedId);
      if (pendingNewNoteIdRef.current !== resolvedId) {
        pendingNewNoteIdRef.current = null;
      }
      // Set selected ID immediately for responsive UI
      setSelectedNoteId(resolvedId);
      const visibleNoteIds = getVisibleNoteIds();
      setSelectionState(visibleNoteIds.includes(resolvedId) ? [resolvedId] : [], {
        anchorId: resolvedId,
        rangeEndId: resolvedId,
      });
      setHasExternalChanges(false);
      const parentFolder = getParentFolderPath(resolvedId);
      const noteIsInCurrentScope =
        selectedScopeRef.current.type !== "folder"
          ? false
          : isNoteInFolderScope(
              resolvedId,
              selectedScopeRef.current.path,
              settingsRef.current.showNotesFromSubfolders ?? false,
            );
      if (
        selectedScopeRef.current.type === "folder" &&
        !searchQueryRef.current.trim() &&
        !noteIsInCurrentScope
      ) {
        setSelectedScope(
          parentFolder ? { type: "folder", path: parentFolder } : { type: "all" },
        );
      }
      // Expand parent folders so the note is visible in the tree
      if (
        parentFolder &&
        selectedScopeRef.current.type !== "recent" &&
        selectedScopeRef.current.type !== "pinned"
      ) {
        revealFolder(parentFolder);
      }
      const note = await notesService.readNote(resolvedId);
      if (requestId !== selectRequestIdRef.current) return;
      markNoteOpenTiming(resolvedId, "read_note resolved");
      setCurrentNote(note);
      void recordRecentNoteView(note.id);
    } catch (err) {
      if (requestId !== selectRequestIdRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load note");
    }
  }, [getVisibleNoteIds, recordRecentNoteView, resolveLiveNoteId, revealFolder, setSelectionState]);

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
      const targetFolder = getFolderPathFromScope(selectedScopeRef.current) ?? undefined;
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
      if (selectedScopeRef.current.type === "folder") {
        setSelectedScope(
          parentFolder ? { type: "folder", path: parentFolder } : { type: "all" },
        );
      }
      // Clear search when creating a new note
      setSearchQuery("");
      setSearchResults([]);
      void recordRecentNoteView(note.id);
      setTimeout(() => {
        recentlySavedRef.current.delete(note.id);
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create note");
    }
  }, [recordRecentNoteView, refreshNotes, setSelectionState]);

  const consumePendingNewNote = useCallback((id: string) => {
    if (pendingNewNoteIdRef.current !== id) {
      pendingNewNoteIdRef.current = null;
      return false;
    }
    pendingNewNoteIdRef.current = null;
    return true;
  }, []);

  const applyUpdatedNoteState = useCallback(
    async (previousId: string, updated: Note) => {
      if (updated.id !== previousId) {
        noteIdRedirectsRef.current.set(previousId, updated.id);
        const pinnedIds = settingsRef.current.pinnedNoteIds || [];
        const recentNoteIds = settingsRef.current.recentNoteIds || [];
        if (pinnedIds.includes(previousId) || recentNoteIds.includes(previousId)) {
          await persistSettings((currentSettings) => ({
            ...currentSettings,
            pinnedNoteIds: normalizeNoteIds(
              (currentSettings.pinnedNoteIds || []).map((id) =>
                id === previousId ? updated.id : id,
              ),
            ),
            recentNoteIds: sanitizeRecentNoteIds(
              (currentSettings.recentNoteIds || []).map((id) =>
                id === previousId ? updated.id : id,
              ),
            ),
          }));
        }
      }

      setHasExternalChanges(false);
      setCurrentNote((prevNote) =>
        prevNote?.id === previousId || prevNote?.id === updated.id ? updated : prevNote,
      );
      setSelectedNoteId((prevId) => (prevId === previousId ? updated.id : prevId));
      setSelectedNoteIds((prevIds) =>
        prevIds.map((id) => (id === previousId ? updated.id : id)),
      );

      if (selectionAnchorIdRef.current === previousId) {
        selectionAnchorIdRef.current = updated.id;
      }
      if (selectionRangeEndIdRef.current === previousId) {
        selectionRangeEndIdRef.current = updated.id;
      }
    },
    [persistSettings],
  );

  const saveNote = useCallback(
    async (content: string, noteId?: string) => {
      // Use provided noteId (for flush saves) or fall back to currentNote.id
      const requestedNoteId = noteId || currentNote?.id;
      if (!requestedNoteId) return;
      const savingNoteId = resolveLiveNoteId(requestedNoteId);
      let updatedId: string | null = null;

      // Stamp this save so we can discard completions from older concurrent saves
      const seq = (saveSequenceRef.current.get(savingNoteId) ?? 0) + 1;
      saveSequenceRef.current.set(savingNoteId, seq);

      try {
        // Mark this note as recently saved to ignore file-change events from our own save
        recentlySavedRef.current.add(savingNoteId);

        const updated = await notesService.saveNote(savingNoteId, content);

        // A newer save was started for this note while we were awaiting — discard
        if (saveSequenceRef.current.get(savingNoteId) !== seq) {
          recentlySavedRef.current.delete(savingNoteId);
          return;
        }

        updatedId = updated.id;
        if (updated.id !== savingNoteId) {
          recentlySavedRef.current.add(updated.id);
        }

        await applyUpdatedNoteState(savingNoteId, updated);

        // Schedule refresh with debounce - avoids blocking typing during rapid saves
        scheduleRefresh();

        // Clear the recently saved flag after a short delay
        // (longer than the file watcher debounce of 500ms)
        setTimeout(() => {
          recentlySavedRef.current.delete(savingNoteId);
          if (updatedId) recentlySavedRef.current.delete(updatedId);
        }, 1000);
      } catch (err) {
        const latestKnownId = resolveLiveNoteId(requestedNoteId);
        if (
          latestKnownId !== requestedNoteId &&
          err instanceof Error &&
          err.message === "Note not found"
        ) {
          recentlySavedRef.current.delete(savingNoteId);
          if (updatedId) recentlySavedRef.current.delete(updatedId);
          return;
        }

        setError(err instanceof Error ? err.message : "Failed to save note");
        // Clean up immediately on error to avoid leaving stale entries
        recentlySavedRef.current.delete(savingNoteId);
        if (updatedId) recentlySavedRef.current.delete(updatedId);
      }
    },
    [applyUpdatedNoteState, currentNote, resolveLiveNoteId, scheduleRefresh]
  );

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

  const refreshActiveSearchResults = useCallback(async () => {
    const activeQuery = searchQueryRef.current.trim();
    if (!activeQuery) return;
    await search(activeQuery);
  }, [search]);

  const renameNote = useCallback(
    async (id: string, newName: string) => {
      const resolvedId = resolveLiveNoteId(id);
      let updatedId: string | null = null;

      try {
        recentlySavedRef.current.add(resolvedId);
        const updated = await notesService.renameNote(resolvedId, newName);
        updatedId = updated.id;

        if (updated.id !== resolvedId) {
          recentlySavedRef.current.add(updated.id);
        }

        await applyUpdatedNoteState(resolvedId, updated);
        await refreshNotes();
        await refreshActiveSearchResults();

        setTimeout(() => {
          recentlySavedRef.current.delete(resolvedId);
          if (updatedId) recentlySavedRef.current.delete(updatedId);
        }, 1000);
        return updated;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to rename note");
        recentlySavedRef.current.delete(resolvedId);
        if (updatedId) recentlySavedRef.current.delete(updatedId);
        throw err;
      }
    },
    [applyUpdatedNoteState, refreshActiveSearchResults, refreshNotes, resolveLiveNoteId],
  );

  const deleteNote = useCallback(
    async (id: string) => {
      const resolvedId = resolveLiveNoteId(id);
      try {
        await notesService.deleteNote(resolvedId);

        // Clean up pinned status for deleted note
        const pinnedIds = settingsRef.current.pinnedNoteIds || [];
        const recentNoteIds = settingsRef.current.recentNoteIds || [];
        if (pinnedIds.includes(resolvedId) || recentNoteIds.includes(resolvedId)) {
          await persistSettings((currentSettings) => ({
            ...currentSettings,
            pinnedNoteIds: normalizeNoteIds(
              (currentSettings.pinnedNoteIds || []).filter((pinId) => pinId !== resolvedId),
            ),
            recentNoteIds: sanitizeRecentNoteIds(
              (currentSettings.recentNoteIds || []).filter(
                (recentId) => recentId !== resolvedId,
              ),
            ),
          }));
        }

        // Only clear selection if we're deleting the currently selected note
        setSelectedNoteId((prevId) => {
          if (prevId === resolvedId) {
            setCurrentNote(null);
            return null;
          }
          return prevId;
        });
        setSelectedNoteIds((prevIds) => prevIds.filter((noteId) => noteId !== resolvedId));
        if (selectionAnchorIdRef.current === resolvedId) {
          selectionAnchorIdRef.current = selectedNoteIdRef.current === resolvedId ? null : selectedNoteIdRef.current;
        }
        if (selectionRangeEndIdRef.current === resolvedId) {
          selectionRangeEndIdRef.current = selectionAnchorIdRef.current;
        }
        await refreshNotes();
        await refreshActiveSearchResults();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete note");
      }
    },
    [persistSettings, refreshActiveSearchResults, refreshNotes, resolveLiveNoteId]
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
      const pinnedIds = settingsRef.current.pinnedNoteIds || [];
      const recentNoteIds = settingsRef.current.recentNoteIds || [];
      if (
        pinnedIds.some((id) => deletedSet.has(id)) ||
        recentNoteIds.some((id) => deletedSet.has(id))
      ) {
        await persistSettings((currentSettings) => ({
          ...currentSettings,
          pinnedNoteIds: removeNoteIds(
            currentSettings.pinnedNoteIds,
            deletedSet,
          ),
          recentNoteIds: sanitizeRecentNoteIds(
            removeNoteIds(currentSettings.recentNoteIds, deletedSet),
          ),
        }));
      }
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
    persistSettings,
    refreshActiveSearchResults,
    refreshNotes,
    setSelectionState,
  ]);

  const duplicateNote = useCallback(
    async (id: string) => {
      const resolvedId = resolveLiveNoteId(id);
      try {
        const newNote = await notesService.duplicateNote(resolvedId);
        selectRequestIdRef.current += 1;
        pendingNewNoteIdRef.current = newNote.id;
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
        if (selectedScopeRef.current.type === "folder") {
          setSelectedScope(
            parentFolder ? { type: "folder", path: parentFolder } : { type: "all" },
          );
        }
        void recordRecentNoteView(newNote.id);
        setTimeout(() => {
          recentlySavedRef.current.delete(newNote.id);
        }, 1000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to duplicate note");
      }
    },
    [recordRecentNoteView, refreshNotes, resolveLiveNoteId, setSelectionState]
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
        setSelectedScope({ type: "folder", path: folderPath });
        revealFolder(folderPath);
        setSearchQuery("");
        setSearchResults([]);
        void recordRecentNoteView(note.id);
        setTimeout(() => {
          recentlySavedRef.current.delete(note.id);
        }, 1000);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to create note"
        );
      }
    },
    [recordRecentNoteView, refreshNotes, revealFolder, setSelectionState]
  );

  const createFolderAction = useCallback(
    async (parentPath: string, name: string) => {
      try {
        const fullPath = parentPath ? `${parentPath}/${name}` : name;
        await notesService.createFolder(fullPath);
        setKnownFolders((currentFolders) =>
          currentFolders.includes(fullPath)
            ? currentFolders
            : [...currentFolders, fullPath],
        );
        setHasLoadedFolders(true);
        await refreshNotes();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to create folder"
        );
        throw err;
      }
    },
    [refreshNotes]
  );

  const deleteFolderAction = useCallback(
    async (path: string) => {
      try {
        await notesService.deleteFolder(path);
        const folderPrefix = `${path}/`;
        await refreshSettings();
        setKnownFolders((currentFolders) =>
          currentFolders.filter(
            (folderPath) =>
              folderPath !== path && !folderPath.startsWith(folderPrefix),
          ),
        );
        setHasLoadedFolders(true);
        // If the selected note was inside the deleted folder, clear selection
        setSelectedNoteId((prevId) => {
          if (prevId && prevId.startsWith(folderPrefix)) {
            setCurrentNote(null);
            return null;
          }
          return prevId;
        });
        setSelectedNoteIds((prevIds) =>
          prevIds.filter((noteId) => !noteId.startsWith(folderPrefix)),
        );
        if (
          selectionAnchorIdRef.current &&
          selectionAnchorIdRef.current.startsWith(folderPrefix)
        ) {
          selectionAnchorIdRef.current = null;
        }
        if (
          selectionRangeEndIdRef.current &&
          selectionRangeEndIdRef.current.startsWith(folderPrefix)
        ) {
          selectionRangeEndIdRef.current = selectionAnchorIdRef.current;
        }
        setSelectedScope((prevScope) => {
          if (prevScope.type !== "folder") return prevScope;
          if (
            prevScope.path === path ||
            prevScope.path.startsWith(folderPrefix)
          ) {
            const nextPath = getParentPath(path);
            return nextPath ? { type: "folder", path: nextPath } : { type: "all" };
          }
          return prevScope;
        });
        await refreshNotes();
        await refreshActiveSearchResults();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to delete folder"
        );
      }
    },
    [refreshActiveSearchResults, refreshNotes, refreshSettings]
  );

  const remapLocalStateForFolderPathChange = useCallback(
    (oldPath: string, newPath: string) => {
      const oldPrefix = `${oldPath}/`;
      const newPrefix = `${newPath}/`;

      setSelectedNoteId((prevId) => {
        if (prevId && prevId.startsWith(oldPrefix)) {
          const newId = `${newPrefix}${prevId.substring(oldPrefix.length)}`;
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
            ? `${newPrefix}${id.substring(oldPrefix.length)}`
            : id,
        ),
      );
      if (
        selectionAnchorIdRef.current &&
        selectionAnchorIdRef.current.startsWith(oldPrefix)
      ) {
        selectionAnchorIdRef.current =
          `${newPrefix}${selectionAnchorIdRef.current.substring(oldPrefix.length)}`;
      }
      if (
        selectionRangeEndIdRef.current &&
        selectionRangeEndIdRef.current.startsWith(oldPrefix)
      ) {
        selectionRangeEndIdRef.current =
          `${newPrefix}${selectionRangeEndIdRef.current.substring(oldPrefix.length)}`;
      }
      setKnownFolders((currentFolders) =>
        rewriteFolderPathList(currentFolders, oldPath, newPath),
      );
      setFolderRevealRequest((currentRequest) => {
        if (!currentRequest) {
          return currentRequest;
        }

        const nextPath = rewriteFolderPathList(
          [currentRequest.path],
          oldPath,
          newPath,
        )[0];

        return nextPath === currentRequest.path
          ? currentRequest
          : { ...currentRequest, path: nextPath };
      });
      setSelectedScope((prevScope) => {
        if (prevScope.type !== "folder") return prevScope;
        if (prevScope.path === oldPath) {
          return { type: "folder", path: newPath };
        }
        if (prevScope.path.startsWith(oldPrefix)) {
          return {
            type: "folder",
            path: `${newPrefix}${prevScope.path.substring(oldPrefix.length)}`,
          };
        }
        return prevScope;
      });
    },
    [],
  );

  const renameFolderAction = useCallback(
    async (oldPath: string, newName: string) => {
      try {
        await notesService.renameFolder(oldPath, newName);
        await refreshSettings();

        // Compute new folder path
        const lastSlash = oldPath.lastIndexOf("/");
        const newPath =
          lastSlash >= 0
            ? `${oldPath.substring(0, lastSlash)}/${newName}`
            : newName;
        remapLocalStateForFolderPathChange(oldPath, newPath);
        setHasLoadedFolders(true);
        await refreshNotes();
        await refreshActiveSearchResults();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to rename folder"
        );
        throw err;
      }
    },
    [refreshActiveSearchResults, refreshNotes, refreshSettings, remapLocalStateForFolderPathChange]
  );

  const moveNoteAction = useCallback(
    async (id: string, targetFolder: string) => {
      const resolvedId = resolveLiveNoteId(id);
      try {
        const newId = await notesService.moveNote(resolvedId, targetFolder);
        const pinnedNoteIds = settingsRef.current.pinnedNoteIds || [];
        const recentNoteIds = settingsRef.current.recentNoteIds || [];
        if (pinnedNoteIds.includes(resolvedId) || recentNoteIds.includes(resolvedId)) {
          const moveMap = new Map([[resolvedId, newId]] as const);
          await persistSettings((currentSettings) => ({
            ...currentSettings,
            pinnedNoteIds: pinnedNoteIds.includes(resolvedId)
              ? replaceNoteIds(currentSettings.pinnedNoteIds, moveMap)
              : currentSettings.pinnedNoteIds,
            recentNoteIds: sanitizeRecentNoteIds(
              replaceNoteIds(
                currentSettings.recentNoteIds,
                moveMap,
              ),
            ),
          }));
        }
        // Update selection if we moved the selected note
        setSelectedNoteId((prevId) => {
          if (prevId === resolvedId) {
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
          prevIds.map((noteId) => (noteId === resolvedId ? newId : noteId)),
        );
        if (selectionAnchorIdRef.current === resolvedId) {
          selectionAnchorIdRef.current = newId;
        }
        if (selectionRangeEndIdRef.current === resolvedId) {
          selectionRangeEndIdRef.current = newId;
        }
        setSelectedScope((prevScope) => {
          if (
            prevScope.type === "folder" &&
            getParentFolderPath(resolvedId) === prevScope.path
          ) {
            return targetFolder
              ? { type: "folder", path: targetFolder }
              : { type: "all" };
          }
          return prevScope;
        });
        await refreshNotes();
        await refreshActiveSearchResults();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to move note");
      }
    },
    [persistSettings, refreshActiveSearchResults, refreshNotes, resolveLiveNoteId]
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
        const pinnedNoteIds = settingsRef.current.pinnedNoteIds || [];
        const recentNoteIds = settingsRef.current.recentNoteIds || [];
        if (
          pinnedNoteIds.some((noteId) => moveMap.has(noteId)) ||
          recentNoteIds.some((noteId) => moveMap.has(noteId))
        ) {
          const movedPinnedNoteIds = pinnedNoteIds.some((noteId) =>
            moveMap.has(noteId),
          );
          await persistSettings((currentSettings) => ({
            ...currentSettings,
            pinnedNoteIds: movedPinnedNoteIds
              ? replaceNoteIds(currentSettings.pinnedNoteIds, moveMap)
              : currentSettings.pinnedNoteIds,
            recentNoteIds: sanitizeRecentNoteIds(
              replaceNoteIds(currentSettings.recentNoteIds, moveMap),
            ),
          }));
        }

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

        setSelectedScope((prevScope) => {
          const activeId = selectedNoteIdRef.current;
          if (prevScope.type !== "folder" || !activeId) return prevScope;
          if (getParentFolderPath(activeId) === prevScope.path) {
            return targetFolder
              ? { type: "folder", path: targetFolder }
              : { type: "all" };
          }
          return prevScope;
        });

        await refreshNotes();
        await refreshActiveSearchResults();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to move selected notes",
        );
        throw err;
      }
    },
    [moveNoteAction, persistSettings, refreshActiveSearchResults, refreshNotes, setSelectionState],
  );

  const moveFolderAction = useCallback(
    async (path: string, targetParent: string) => {
      try {
        await notesService.moveFolder(path, targetParent);
        await refreshSettings();

        // Compute new folder path
        const folderName = path.includes("/")
          ? path.substring(path.lastIndexOf("/") + 1)
          : path;
        const newPath = targetParent
          ? `${targetParent}/${folderName}`
          : folderName;
        remapLocalStateForFolderPathChange(path, newPath);
        setHasLoadedFolders(true);
        await refreshNotes();
        await refreshActiveSearchResults();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to move folder");
        throw err;
      }
    },
    [refreshActiveSearchResults, refreshNotes, refreshSettings, remapLocalStateForFolderPathChange]
  );

  const setFolderAppearance = useCallback(async (
    path: string,
    appearance: FolderAppearance | null,
  ) => {
    if (!path) return;

    try {
      await persistSettings((currentSettings) => {
        const nextFolderIcons = sanitizeFolderAppearances(
          currentSettings.folderIcons,
        );
        const normalizedAppearance = sanitizeFolderAppearances({
          [path]: appearance,
        })[path];

        if (normalizedAppearance) {
          nextFolderIcons[path] = normalizedAppearance;
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
        err instanceof Error ? err.message : "Failed to update folder style"
      );
      throw err;
    }
  }, [persistSettings]);

  const setNotesFolder = useCallback(async (path: string) => {
    try {
      await notesService.setNotesFolder(path);
      setNotesFolderState(path);
      setKnownFolders([]);
      setHasLoadedFolders(false);
      applySettings(DEFAULT_SETTINGS);
      noteIdRedirectsRef.current.clear();
      setSelectedScope({ type: "all" });
      setSelectedNoteId(null);
      setSelectionState([], { anchorId: null, rangeEndId: null });
      setCurrentNote(null);
      // Start file watcher after setting folder
      await notesService.startFileWatcher();
      await refreshKnownFolders(path);
      await refreshSettings();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to set notes folder"
      );
    }
  }, [applySettings, refreshKnownFolders, refreshSettings, setSelectionState]);

  // Update local state only (backend already initialized the folder).
  // Used when the CLI sets the notes folder and emits an event.
  const syncNotesFolder = useCallback(async (path: string) => {
    try {
      setNotesFolderState(path);
      setKnownFolders([]);
      setHasLoadedFolders(false);
      applySettings(DEFAULT_SETTINGS);
      noteIdRedirectsRef.current.clear();
      setSelectedScope({ type: "all" });
      setSelectedNoteId(null);
      setSelectionState([], { anchorId: null, rangeEndId: null });
      setCurrentNote(null);
      const notesList = await notesService.listNotes();
      setNotes(notesList);
      await refreshKnownFolders(path);
      await notesService.startFileWatcher();
      await refreshSettings();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to sync notes folder"
      );
    }
  }, [applySettings, refreshKnownFolders, refreshSettings, setSelectionState]);

  // Load initial state
  useEffect(() => {
    async function init() {
      try {
        const folder = await notesService.getNotesFolder();
        setNotesFolderState(folder);
        if (folder) {
          const [notesList, folders] = await Promise.all([
            notesService.listNotes(),
            notesService.listFolders(),
          ]);
          setNotes(notesList);
          setKnownFolders(folders);
          setHasLoadedFolders(true);
          await refreshSettings();
          // Start file watcher
          await notesService.startFileWatcher();
        } else {
          setKnownFolders([]);
          setHasLoadedFolders(true);
          applySettings(DEFAULT_SETTINGS);
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
        scheduleRefresh();

        // If the currently selected note was changed externally, set flag (don't auto-reload)
        const currentId = selectedNoteIdRef.current;
        if (currentId && externalChanges.includes(currentId)) {
          setHasExternalChanges(true);
        }
      }

      if (event.payload.folder_structure_changed) {
        void refreshKnownFolders();
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
  }, [refreshKnownFolders, scheduleRefresh]);

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

  const pinnedNotes = useMemo(
    () =>
      getScopedNotes(
        notes,
        { type: "pinned" },
        settings.recentNoteIds,
        false,
        settings.pinnedNoteIds,
        settings.noteSortMode ?? DEFAULT_NOTE_SORT_MODE,
      ),
    [notes, settings.noteSortMode, settings.pinnedNoteIds, settings.recentNoteIds],
  );

  const recentNotes = useMemo(
    () =>
      getScopedNotes(
        notes,
        { type: "recent" },
        settings.recentNoteIds,
      ),
    [notes, settings.recentNoteIds],
  );

  const scopedNotes = useMemo(
    () =>
      getScopedNotes(
        notes,
        selectedScope,
        selectedScope.type === "recent"
          ? recentScopeNoteIds
          : settings.recentNoteIds,
        showNotesFromSubfolders,
        settings.pinnedNoteIds,
        effectiveNoteSortMode,
      ),
    [
      notes,
      effectiveNoteSortMode,
      recentScopeNoteIds,
      selectedScope,
      settings.pinnedNoteIds,
      settings.recentNoteIds,
      showNotesFromSubfolders,
    ],
  );

  useEffect(() => {
    if (!showPinnedNotes && selectedScope.type === "pinned") {
      setSelectedScope({ type: "all" });
      return;
    }

    if (!showRecentNotes && selectedScope.type === "recent") {
      setSelectedScope({ type: "all" });
    }
  }, [selectedScope, showPinnedNotes, showRecentNotes]);

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
    selectedScope,
    selectedNoteId,
  ]);

  // Memoize data context value to prevent unnecessary re-renders
  const dataValue = useMemo<NotesDataContextValue>(
    () => ({
      notes,
      scopedNotes,
      pinnedNotes,
      recentNotes,
      knownFolders,
      hasLoadedFolders,
      showPinnedNotes,
      showRecentNotes,
      showNoteCounts,
      showNotesFromSubfolders,
      noteListDateMode,
      noteListPreviewLines,
      showNoteListFilename,
      showNoteListFolderPath,
      showNoteListPreview,
      settings,
      folderAppearances,
      noteSortMode: effectiveNoteSortMode,
      folderSortMode: settings.folderSortMode || DEFAULT_FOLDER_SORT_MODE,
      selectedScope,
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
      folderRevealRequest,
    }),
    [
      notes,
      scopedNotes,
      pinnedNotes,
      recentNotes,
      knownFolders,
      hasLoadedFolders,
      showPinnedNotes,
      showRecentNotes,
      showNoteCounts,
      showNotesFromSubfolders,
      noteListDateMode,
      noteListPreviewLines,
      showNoteListFilename,
      showNoteListFolderPath,
      showNoteListPreview,
      settings,
      folderAppearances,
      effectiveNoteSortMode,
      selectedScope,
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
      folderRevealRequest,
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
      selectPinnedNotes,
      selectRecentNotes,
      createNote,
      consumePendingNewNote,
      saveNote,
      renameNote,
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
      revealFolder,
      moveNote: moveNoteAction,
      moveSelectedNotes,
      moveFolder: moveFolderAction,
      setFolderAppearance,
      setCollapsedFolders,
      setNoteSortMode,
      setNoteListViewOptions,
      setFolderSortMode,
      setShowPinnedNotes,
      setShowRecentNotes,
    }),
    [
      selectNote,
      toggleNoteSelection,
      selectNoteRange,
      clearNoteSelection,
      selectAllVisibleNotes,
      selectFolder,
      selectPinnedNotes,
      selectRecentNotes,
      createNote,
      consumePendingNewNote,
      saveNote,
      renameNote,
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
      revealFolder,
      moveNoteAction,
      moveSelectedNotes,
      moveFolderAction,
      setFolderAppearance,
      setCollapsedFolders,
      setNoteSortMode,
      setNoteListViewOptions,
      setFolderSortMode,
      setShowPinnedNotes,
      setShowRecentNotes,
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

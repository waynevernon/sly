import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  ArrowDownAZ,
  ArrowUpAZ,
  CalendarArrowDown,
  CalendarArrowUp,
  ClockArrowDown,
  ClockArrowUp,
  FilePlusCorner,
  History,
} from "lucide-react";
import { useNotes } from "../../context/NotesContext";
import { useTheme } from "../../context/ThemeContext";
import type {
  NoteListDateMode,
  NoteListPreviewLines,
  NoteScope,
} from "../../types/note";
import type { NoteListItem } from "../notes/NoteList";
import { NoteList } from "../notes/NoteList";
import {
  CountBadge,
  IconButton,
  Input,
  menuItemClassName,
  menuLabelClassName,
  menuSeparatorClassName,
  menuSurfaceClassName,
} from "../ui";
import {
  ChevronRightIcon,
  SearchIcon,
  SearchOffIcon,
  TrashIcon,
  XIcon,
} from "../icons";
import { FolderGlyph } from "../folders/FolderGlyph";
import {
  getFolderAppearance,
  resolveFolderAppearanceIconColor,
  resolveFolderAppearanceTextColor,
} from "../../lib/folderIcons";
import { SortMenuButton, type SortMenuItem } from "./SortMenuButton";
import type { NoteSortMode } from "../../types/note";

const noteSortItems: SortMenuItem<NoteSortMode>[] = [
  {
    key: "modified",
    label: "Last Modified",
    isActive: (value) => value === "modifiedDesc" || value === "modifiedAsc",
    getNextValue: (value) =>
      value === "modifiedDesc"
        ? "modifiedAsc"
        : value === "modifiedAsc"
          ? "modifiedDesc"
          : "modifiedDesc",
    renderIcon: (value, isActive) => {
      const isAscending = value === "modifiedAsc";
      const Icon =
        isActive && isAscending ? ClockArrowUp : ClockArrowDown;
      return <Icon className="w-4 h-4 stroke-[1.6]" />;
    },
  },
  {
    key: "created",
    label: "Created",
    isActive: (value) => value === "createdDesc" || value === "createdAsc",
    getNextValue: (value) =>
      value === "createdDesc"
        ? "createdAsc"
        : value === "createdAsc"
          ? "createdDesc"
          : "createdDesc",
    renderIcon: (value, isActive) => {
      const isAscending = value === "createdAsc";
      const Icon =
        isActive && isAscending ? CalendarArrowUp : CalendarArrowDown;
      return <Icon className="w-4 h-4 stroke-[1.6]" />;
    },
  },
  {
    key: "title",
    label: "Title",
    isActive: (value) => value === "titleAsc" || value === "titleDesc",
    getNextValue: (value) =>
      value === "titleAsc"
        ? "titleDesc"
        : value === "titleDesc"
          ? "titleAsc"
          : "titleAsc",
    renderIcon: (value, isActive) => {
      const isDescending = value === "titleDesc";
      const Icon =
        isActive && isDescending ? ArrowUpAZ : ArrowDownAZ;
      return <Icon className="w-4 h-4 stroke-[1.6]" />;
    },
  },
];

function getScopeLabel(scope: NoteScope, path: string | null): string {
  if (scope.type === "recent") return "Recent Notes";
  if (!path) return "All Notes";
  const parts = path.split("/");
  return parts[parts.length - 1];
}

function getDateModeLabel(mode: NoteListDateMode): string {
  switch (mode) {
    case "created":
      return "Created";
    case "off":
      return "None";
    default:
      return "Modified";
  }
}

function getPreviewLinesLabel(lines: 0 | NoteListPreviewLines): string {
  if (lines === 0) return "None";
  return lines === 1 ? "1 Line" : `${lines} Lines`;
}

export function NotesPane() {
  const {
    notes,
    scopedNotes,
    folderAppearances,
    noteSortMode,
    noteListDateMode,
    noteListPreviewLines,
    showNoteCounts,
    showNotesFromSubfolders,
    showNoteListFilename,
    showNoteListFolderPath,
    selectedScope,
    selectedNoteIds,
    selectedFolderPath,
    createNote,
    clearNoteSelection,
    search,
    searchQuery,
    searchResults,
    clearSearch,
    setNoteSortMode,
    setNoteListViewOptions,
  } = useNotes();
  const { resolvedTheme } = useTheme();

  const [searchOpen, setSearchOpen] = useState(false);
  const [inputValue, setInputValue] = useState(searchQuery);
  const debounceRef = useRef<number | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInputValue(searchQuery);
    if (searchQuery.trim()) {
      setSearchOpen(true);
    }
  }, [searchQuery]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const displayItems = useMemo<NoteListItem[]>(() => {
    if (searchQuery.trim()) {
      const notesById = new Map(notes.map((note) => [note.id, note] as const));
      return searchResults.map((result) => ({
        id: result.id,
        title: result.title,
        preview: result.preview,
        modified: result.modified,
        created: notesById.get(result.id)?.created ?? result.modified,
      }));
    }

    return scopedNotes;
  }, [notes, scopedNotes, searchQuery, searchResults]);

  const heading = searchQuery.trim()
    ? "Search Results"
    : getScopeLabel(selectedScope, selectedFolderPath);
  const noteCount = displayItems.length;
  const showSubfolderNotesInCurrentView =
    selectedScope.type === "folder" && showNotesFromSubfolders;
  const selectedFolderAppearance = getFolderAppearance(
    folderAppearances,
    selectedFolderPath,
  );
  const selectedFolderIcon = selectedFolderAppearance?.icon ?? null;
  const selectedFolderIconStyle = useMemo(() => {
    const color = resolveFolderAppearanceIconColor(
      selectedFolderAppearance,
      resolvedTheme,
    );
    return color ? { color } : undefined;
  }, [resolvedTheme, selectedFolderAppearance]);
  const selectedFolderTextStyle = useMemo(() => {
    const color = resolveFolderAppearanceTextColor(
      selectedFolderAppearance,
      resolvedTheme,
    );
    return color ? { color } : undefined;
  }, [resolvedTheme, selectedFolderAppearance]);
  const selectionCount = selectedNoteIds.length;
  const hasBatchSelection = selectionCount > 1;

  const handleSearchChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setInputValue(value);

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = window.setTimeout(() => {
        void search(value);
      }, 220);
    },
    [search],
  );

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setInputValue("");
    clearSearch();
  }, [clearSearch]);

  const toggleSearch = useCallback(() => {
    setSearchOpen((prev) => {
      if (prev) {
        setInputValue("");
        clearSearch();
      }
      return !prev;
    });
  }, [clearSearch]);

  const handleSearchKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== "Escape") return;

      event.preventDefault();
      if (inputValue) {
        setInputValue("");
        clearSearch();
      } else {
        closeSearch();
      }
    },
    [clearSearch, closeSearch, inputValue],
  );

  useEffect(() => {
    if (!searchOpen) return;

    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
  }, [searchOpen]);

  useEffect(() => {
    const handleOpenSearch = () => {
      setSearchOpen(true);
      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
    };

    window.addEventListener("open-notes-search", handleOpenSearch);
    return () => window.removeEventListener("open-notes-search", handleOpenSearch);
  }, []);

  return (
    <div className="h-full bg-bg border-r border-border/80 flex flex-col select-none">
      <div className="ui-pane-drag-region" data-tauri-drag-region></div>
      <div className="ui-pane-header border-border/80">
        <div className="min-w-0 flex items-center gap-1.5">
          {!searchQuery.trim() && !hasBatchSelection && (
            selectedScope.type === "recent" ? (
              <History className="w-4.5 h-4.5 text-text-muted/80 shrink-0 stroke-[1.7]" />
            ) : (
              <FolderGlyph
                icon={selectedFolderIcon}
                className="w-4.5 h-4.5 text-text-muted/80 shrink-0"
                strokeWidth={1.7}
                style={selectedFolderIconStyle}
              />
            )
          )}
          <div
            className="font-medium text-base text-text truncate"
            style={
              !hasBatchSelection &&
              !searchQuery.trim() &&
              selectedScope.type === "folder"
                ? selectedFolderTextStyle
                : undefined
            }
          >
            {hasBatchSelection ? `${selectionCount} selected` : heading}
          </div>
          {!hasBatchSelection && showNoteCounts && (
            <CountBadge
              count={noteCount}
              layout="inline"
              emphasis="active"
              className="mt-0.5 pt-px shrink-0"
            />
          )}
        </div>
        <div className="ui-pane-header-actions">
          {hasBatchSelection ? (
            <>
              <IconButton
                onClick={() => {
                  window.dispatchEvent(
                    new CustomEvent("request-delete-note", {
                      detail: selectedNoteIds,
                    }),
                  );
                }}
                title="Delete Selected Notes"
                variant="ghost"
              >
                <TrashIcon className="w-4.5 h-4.5 stroke-[1.5]" />
              </IconButton>
              <IconButton
                onClick={clearNoteSelection}
                title="Clear Selection"
              >
                <XIcon className="w-4.5 h-4.5 stroke-[1.5]" />
              </IconButton>
            </>
          ) : (
            <>
              {!searchQuery.trim() && (
                <SortMenuButton
                  title="Sort Notes"
                  value={noteSortMode}
                  items={noteSortItems}
                  onChange={(nextMode) => {
                    void setNoteSortMode(nextMode);
                  }}
                >
                  <DropdownMenu.Separator className={menuSeparatorClassName} />
                  <DropdownMenu.Label className={menuLabelClassName}>
                    View
                  </DropdownMenu.Label>
                  <DropdownMenu.Separator className={menuSeparatorClassName} />
                  <DropdownMenu.CheckboxItem
                    checked={showNotesFromSubfolders}
                    className={menuItemClassName}
                    onCheckedChange={(checked) => {
                      void setNoteListViewOptions({
                        showNotesFromSubfolders: checked === true,
                      });
                    }}
                  >
                    <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-text">
                      <DropdownMenu.ItemIndicator>
                        <span className="text-xs leading-none">✓</span>
                      </DropdownMenu.ItemIndicator>
                    </span>
                    <span>Notes From Subfolders</span>
                  </DropdownMenu.CheckboxItem>
                  <DropdownMenu.Separator className={menuSeparatorClassName} />
                  <DropdownMenu.Sub>
                    <DropdownMenu.SubTrigger className={menuItemClassName}>
                      <span className="inline-flex h-4 w-4 shrink-0" />
                      <span>Text Preview</span>
                      <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-text-muted">
                        {getPreviewLinesLabel(noteListPreviewLines)}
                        <ChevronRightIcon className="w-4 h-4 stroke-[1.6]" />
                      </span>
                    </DropdownMenu.SubTrigger>
                    <DropdownMenu.Portal>
                      <DropdownMenu.SubContent
                        sideOffset={6}
                        className={`${menuSurfaceClassName} min-w-44 z-50`}
                      >
                        <DropdownMenu.RadioGroup
                          value={String(noteListPreviewLines)}
                          onValueChange={(value) => {
                            void setNoteListViewOptions({
                              noteListPreviewLines:
                                value === "0"
                                  ? 0
                                  : (Number(value) as NoteListPreviewLines),
                            });
                          }}
                        >
                          <DropdownMenu.RadioItem
                            value="3"
                            className={menuItemClassName}
                          >
                            <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-text">
                              {noteListPreviewLines === 3 && (
                                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                              )}
                            </span>
                            <span>3 Lines</span>
                          </DropdownMenu.RadioItem>
                          <DropdownMenu.RadioItem
                            value="2"
                            className={menuItemClassName}
                          >
                            <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-text">
                              {noteListPreviewLines === 2 && (
                                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                              )}
                            </span>
                            <span>2 Lines</span>
                          </DropdownMenu.RadioItem>
                          <DropdownMenu.RadioItem
                            value="1"
                            className={menuItemClassName}
                          >
                            <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-text">
                              {noteListPreviewLines === 1 && (
                                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                              )}
                            </span>
                            <span>1 Line</span>
                          </DropdownMenu.RadioItem>
                          <DropdownMenu.RadioItem
                            value="0"
                            className={menuItemClassName}
                          >
                            <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-text">
                              {noteListPreviewLines === 0 && (
                                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                              )}
                            </span>
                            <span>None</span>
                          </DropdownMenu.RadioItem>
                        </DropdownMenu.RadioGroup>
                      </DropdownMenu.SubContent>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Sub>
                  <DropdownMenu.Sub>
                    <DropdownMenu.SubTrigger
                      className={menuItemClassName}
                    >
                      <span className="inline-flex h-4 w-4 shrink-0" />
                      <span>Date</span>
                      <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-text-muted">
                        {getDateModeLabel(noteListDateMode)}
                        <ChevronRightIcon className="w-4 h-4 stroke-[1.6]" />
                      </span>
                    </DropdownMenu.SubTrigger>
                    <DropdownMenu.Portal>
                      <DropdownMenu.SubContent
                        sideOffset={6}
                        className={`${menuSurfaceClassName} min-w-44 z-50`}
                      >
                        <DropdownMenu.RadioGroup
                          value={noteListDateMode}
                          onValueChange={(value) => {
                            void setNoteListViewOptions({
                              noteListDateMode: value as NoteListDateMode,
                            });
                          }}
                        >
                          <DropdownMenu.RadioItem
                            value="modified"
                            className={menuItemClassName}
                          >
                            <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-text">
                              {noteListDateMode === "modified" && (
                                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                              )}
                            </span>
                            <span>Modified Time</span>
                          </DropdownMenu.RadioItem>
                          <DropdownMenu.RadioItem
                            value="created"
                            className={menuItemClassName}
                          >
                            <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-text">
                              {noteListDateMode === "created" && (
                                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                              )}
                            </span>
                            <span>Created Time</span>
                          </DropdownMenu.RadioItem>
                          <DropdownMenu.RadioItem
                            value="off"
                            className={menuItemClassName}
                          >
                            <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-text">
                              {noteListDateMode === "off" && (
                                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                              )}
                            </span>
                            <span>None</span>
                          </DropdownMenu.RadioItem>
                        </DropdownMenu.RadioGroup>
                      </DropdownMenu.SubContent>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Sub>
                  <DropdownMenu.CheckboxItem
                    checked={showNoteListFolderPath}
                    className={menuItemClassName}
                    onCheckedChange={(checked) => {
                      void setNoteListViewOptions({
                        showNoteListFolderPath: checked === true,
                      });
                    }}
                  >
                    <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-text">
                      <DropdownMenu.ItemIndicator>
                        <span className="text-xs leading-none">✓</span>
                      </DropdownMenu.ItemIndicator>
                    </span>
                    <span>Folder Path</span>
                  </DropdownMenu.CheckboxItem>
                  <DropdownMenu.CheckboxItem
                    checked={showNoteListFilename}
                    className={menuItemClassName}
                    onCheckedChange={(checked) => {
                      void setNoteListViewOptions({
                        showNoteListFilename: checked === true,
                      });
                    }}
                  >
                    <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-text">
                      <DropdownMenu.ItemIndicator>
                        <span className="text-xs leading-none">✓</span>
                      </DropdownMenu.ItemIndicator>
                    </span>
                    <span>Filename</span>
                  </DropdownMenu.CheckboxItem>
                </SortMenuButton>
              )}
              <IconButton
                onClick={toggleSearch}
                title="Search Notes"
              >
                {searchOpen ? (
                  <SearchOffIcon className="w-4.25 h-4.25 stroke-[1.5]" />
                ) : (
                  <SearchIcon className="w-4.25 h-4.25 stroke-[1.5]" />
                )}
              </IconButton>
              <IconButton
                variant="ghost"
                onClick={() => {
                  void createNote();
                }}
                title="New Note"
              >
                <FilePlusCorner className="w-4.75 h-4.75 stroke-[1.5]" />
              </IconButton>
            </>
          )}
        </div>
      </div>

      <div
        ref={scrollContainerRef}
        className="ui-scrollbar-overlay flex-1 overflow-y-auto"
      >
        {searchOpen && (
          <div className="sticky top-0 z-10 px-3 pt-2 bg-bg">
            <div className="relative">
              <Input
                ref={searchInputRef}
                type="text"
                value={inputValue}
                onChange={handleSearchChange}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search notes..."
                className="pr-8 text-sm"
              />
              {inputValue && (
                <button
                  type="button"
                  onClick={() => {
                    setInputValue("");
                    clearSearch();
                  }}
                  className="ui-focus-ring absolute right-2 top-1/2 -translate-y-1/2 rounded-[var(--ui-radius-sm)] text-text-muted hover:text-text"
                >
                  <XIcon className="w-4.5 h-4.5 stroke-[1.5]" />
                </button>
              )}
            </div>
          </div>
        )}

        <NoteList
          items={displayItems}
          emptyMessage={
            searchQuery.trim()
              ? "No results found"
              : selectedScope.type === "recent"
                ? "No recent notes yet"
                : selectedFolderPath
                ? showSubfolderNotesInCurrentView
                  ? "No notes in this folder or its subfolders"
                  : "No notes in this folder"
                : "No notes yet"
          }
          showFolderPrefix={
            searchQuery.trim().length > 0 ||
            selectedScope.type !== "folder" ||
            showSubfolderNotesInCurrentView
          }
          forceShowFolderPath={showSubfolderNotesInCurrentView}
        />
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownAZ,
  ArrowUpAZ,
  CalendarArrowDown,
  CalendarArrowUp,
  ClockArrowDown,
  ClockArrowUp,
  FilePlusCorner,
} from "lucide-react";
import { useNotes } from "../../context/NotesContext";
import type { NoteListItem } from "../notes/NoteList";
import { NoteList } from "../notes/NoteList";
import { IconButton, Input } from "../ui";
import { SearchIcon, SearchOffIcon, XIcon } from "../icons";
import { FolderGlyph } from "../folders/FolderGlyph";
import { getFolderIconName } from "../../lib/folderIcons";
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

function getFolderLabel(path: string | null): string {
  if (!path) return "All Notes";
  const parts = path.split("/");
  return parts[parts.length - 1];
}

export function NotesPane() {
  const {
    notes,
    scopedNotes,
    folderIcons,
    noteSortMode,
    selectedFolderPath,
    createNote,
    search,
    searchQuery,
    searchResults,
    clearSearch,
    setNoteSortMode,
  } = useNotes();

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
      return searchResults.map((result) => ({
        id: result.id,
        title: result.title,
        preview: result.preview,
        modified: result.modified,
      }));
    }

    return scopedNotes;
  }, [scopedNotes, searchQuery, searchResults]);

  const heading = searchQuery.trim()
    ? "Search Results"
    : getFolderLabel(selectedFolderPath);
  const noteCount = searchQuery.trim() ? displayItems.length : selectedFolderPath ? scopedNotes.length : notes.length;
  const selectedFolderIcon = getFolderIconName(folderIcons, selectedFolderPath);

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
          {!searchQuery.trim() && (
            <FolderGlyph
              iconName={selectedFolderIcon}
              className="w-4.5 h-4.5 text-text-muted/80 shrink-0"
              strokeWidth={1.7}
            />
          )}
          <div className="font-medium text-base text-text truncate">
            {heading}
          </div>
          <div className="ui-count-badge mt-0.5 pt-px shrink-0">
            {noteCount}
          </div>
        </div>
        <div className="ui-pane-header-actions">
          {!searchQuery.trim() && (
            <SortMenuButton
              title="Sort Notes"
              value={noteSortMode}
              items={noteSortItems}
              onChange={(nextMode) => {
                void setNoteSortMode(nextMode);
              }}
            />
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
              : selectedFolderPath
                ? "No notes in this folder"
                : "No notes yet"
          }
          showFolderPrefix={searchQuery.trim().length > 0 || selectedFolderPath === null}
        />
      </div>
    </div>
  );
}

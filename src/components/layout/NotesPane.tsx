import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNotes } from "../../context/NotesContext";
import type { NoteListItem } from "../notes/NoteList";
import { NoteList } from "../notes/NoteList";
import { Footer } from "./Footer";
import { IconButton, Input } from "../ui";
import { PlusIcon, SearchIcon, SearchOffIcon, XIcon } from "../icons";
import { FolderGlyph } from "../folders/FolderGlyph";
import { getFolderIconName } from "../../lib/folderIcons";

function getFolderLabel(path: string | null): string {
  if (!path) return "All Notes";
  const parts = path.split("/");
  return parts[parts.length - 1];
}

interface NotesPaneProps {
  onOpenSettings?: () => void;
}

export function NotesPane({ onOpenSettings }: NotesPaneProps) {
  const {
    notes,
    scopedNotes,
    folderIcons,
    selectedFolderPath,
    createNote,
    search,
    searchQuery,
    searchResults,
    clearSearch,
  } = useNotes();

  const [searchOpen, setSearchOpen] = useState(false);
  const [inputValue, setInputValue] = useState(searchQuery);
  const debounceRef = useRef<number | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

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
  const subtitle = searchQuery.trim()
    ? "Across all notes"
    : selectedFolderPath
      ? selectedFolderPath
      : "Browse every note";

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
      <div className="h-11 shrink-0" data-tauri-drag-region></div>
      <div className="flex items-start justify-between gap-3 pl-4 pr-3 pb-2 border-b border-border/80 shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
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
            <div className="text-text-muted font-medium text-2xs min-w-4.75 h-4.75 flex items-center justify-center px-1 bg-bg-muted rounded-sm mt-0.5 pt-px shrink-0">
              {noteCount}
            </div>
          </div>
          <div className="text-xs text-text-muted truncate mt-0.5">
            {subtitle}
          </div>
        </div>
        <div className="flex items-center gap-px shrink-0">
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
            <PlusIcon className="w-4.75 h-4.75 stroke-[1.5]" />
          </IconButton>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {searchOpen && (
          <div className="sticky top-0 z-10 px-2 pt-2 bg-bg">
            <div className="relative">
              <Input
                ref={searchInputRef}
                type="text"
                value={inputValue}
                onChange={handleSearchChange}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search notes..."
                className="h-9 pr-8 text-sm"
              />
              {inputValue && (
                <button
                  onClick={() => {
                    setInputValue("");
                    clearSearch();
                  }}
                  tabIndex={-1}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text"
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

      <Footer onOpenSettings={onOpenSettings} />
    </div>
  );
}

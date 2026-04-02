import {
  useState,
  useEffect,
  useCallback,
  useId,
  useRef,
  useMemo,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { FilePlusCorner, PanelRight, SquareArrowOutUpRight } from "lucide-react";
import { toast } from "sonner";
import { useNotes } from "../../context/NotesContext";
import { useTheme } from "../../context/ThemeContext";
import { useGit } from "../../context/GitContext";
import * as notesService from "../../services/notes";
import { downloadPdf, downloadMarkdown } from "../../services/pdf";
import type { Settings } from "../../types/note";
import type { Editor } from "@tiptap/react";
import {
  CommandItem,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Checkbox,
  DialogShell,
} from "../ui";
import {
  cleanPreviewText,
  cleanTitle,
  getDisplayInitial,
} from "../../lib/utils";
import { plainTextFromMarkdown } from "../../lib/plainText";
import { duplicateNote } from "../../services/notes";
import {
  CopyIcon,
  DownloadIcon,
  SettingsIcon,
  SwatchIcon,
  GitCommitIcon,
  RefreshCwIcon,
  TrashIcon,
  PinIcon,
  ZenIcon,
  MarkdownIcon,
  FolderIcon,
  FolderPlusIcon,
} from "../icons";
import { mod, shift } from "../../lib/platform";

interface Command {
  id: string;
  label: string;
  shortcut?: string;
  icon?: ReactNode;
  action: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onOpenSettings?: () => void;
  focusMode?: boolean;
  onToggleFocusMode?: () => void;
  rightPanelVisible?: boolean;
  onToggleRightPanel?: () => void;
  editorRef?: React.RefObject<Editor | null>;
  flushPendingSave?: (() => Promise<void>) | null;
}

export function CommandPalette({
  open,
  onClose,
  onOpenSettings,
  focusMode,
  onToggleFocusMode,
  rightPanelVisible = true,
  onToggleRightPanel,
  editorRef,
  flushPendingSave,
}: CommandPaletteProps) {
  const {
    notes,
    selectNote,
    createNote,
    deleteNote,
    currentNote,
    refreshNotes,
    pinNote,
    unpinNote,
    notesFolder,
  } = useNotes();
  const { setTheme, confirmDeletions, setConfirmDeletions } = useTheme();
  const { status, gitAvailable, gitEnabled, commit, sync, isSyncing } = useGit();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null);
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const dontAskAgainId = useId();
  const [localSearchResults, setLocalSearchResults] = useState<
    { id: string; title: string; preview: string; modified: number }[]
  >([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Load settings when palette opens or current note changes
  useEffect(() => {
    if (open) {
      notesService.getSettings().then(setSettings);
    }
  }, [open, currentNote?.id]);

  // Memoize commands array
  const commands = useMemo<Command[]>(() => {
    const baseCommands: Command[] = [
      {
        id: "new-note",
        label: "New Note",
        shortcut: `${mod} N`,
        icon: <FilePlusCorner className="w-4.5 h-4.5 stroke-[1.5]" />,
        action: () => {
          createNote();
          onClose();
        },
      },
      {
        id: "new-folder",
        label: "New Folder",
        shortcut: undefined,
        icon: <FolderPlusIcon className="w-4.5 h-4.5 stroke-[1.5]" />,
        action: () => {
          onClose();
          window.dispatchEvent(new CustomEvent("create-new-folder"));
        },
      },
    ];

    // Add note-specific commands if a note is selected
    if (currentNote) {
      const isPinned =
        settings?.pinnedNoteIds?.includes(currentNote.id) || false;

      baseCommands.push(
        {
          id: isPinned ? "unpin-note" : "pin-note",
          label: isPinned ? "Unpin Current Note" : "Pin Current Note",
          icon: <PinIcon className="w-5 h-5 stroke-[1.3]" />,
          action: async () => {
            try {
              if (isPinned) {
                await unpinNote(currentNote.id);
              } else {
                await pinNote(currentNote.id);
              }
              onClose();
            } catch (error) {
              console.error("Failed to pin/unpin note:", error);
              toast.error(`Failed to ${isPinned ? "unpin" : "pin"} note`);
            }
          },
        },
        {
          id: "duplicate-note",
          label: "Duplicate Current Note",
          icon: <CopyIcon className="w-4.5 h-4.5 stroke-[1.5]" />,
          action: async () => {
            try {
              const newNote = await duplicateNote(currentNote.id);
              await refreshNotes();
              selectNote(newNote.id);
              onClose();
            } catch (error) {
              console.error("Failed to duplicate note:", error);
            }
          },
        },
        {
          id: "open-note-window",
          label: "Open Current Note in New Window",
          icon: <SquareArrowOutUpRight className="w-4.5 h-4.5 stroke-[1.5]" />,
          action: async () => {
            try {
              await flushPendingSave?.();
              await notesService.openNoteWindow(currentNote.id);
              onClose();
            } catch (error) {
              console.error("Failed to open note window:", error);
              toast.error("Failed to open note in new window");
            }
          },
        },
        {
          id: "delete-note",
          label: "Delete Current Note",
          icon: <TrashIcon className="w-4.5 h-4.5 stroke-[1.5]" />,
          action: async () => {
            if (!confirmDeletions) {
              try {
                await deleteNote(currentNote.id);
                onClose();
              } catch (error) {
                console.error("Failed to delete note:", error);
                toast.error("Failed to delete note");
              }
              return;
            }
            setDontAskAgain(false);
            setNoteToDelete(currentNote.id);
            setDeleteDialogOpen(true);
          },
        },
        {
          id: "copy-markdown",
          label: "Copy Markdown",
          icon: <CopyIcon className="w-4.5 h-4.5 stroke-[1.5]" />,
          action: async () => {
            try {
              let markdown = currentNote.content;
              const editorInstance = editorRef?.current;
              if (editorInstance) {
                const manager = editorInstance.storage.markdown?.manager;
                if (manager) {
                  markdown = manager.serialize(editorInstance.getJSON());
                  markdown = markdown.replace(/&nbsp;|&#160;/g, " ");
                } else {
                  markdown = editorInstance.getText();
                }
              }

              await invoke("copy_to_clipboard", { text: markdown });
              toast.success("Copied as Markdown");
              onClose();
            } catch (error) {
              console.error("Failed to copy markdown:", error);
              toast.error("Failed to copy");
            }
          },
        },
        {
          id: "copy-plain",
          label: "Copy Plain Text",
          icon: <CopyIcon className="w-4.5 h-4.5 stroke-[1.5]" />,
          action: async () => {
            try {
              let markdown = currentNote.content;
              const editorInstance = editorRef?.current;
              if (editorInstance) {
                const manager = editorInstance.storage.markdown?.manager;
                if (manager) {
                  markdown = manager.serialize(editorInstance.getJSON());
                  markdown = markdown.replace(/&nbsp;|&#160;/g, " ");
                } else {
                  markdown = editorInstance.getText();
                }
              }

              const plainText = plainTextFromMarkdown(markdown);
              await invoke("copy_to_clipboard", { text: plainText });
              toast.success("Copied as plain text");
              onClose();
            } catch (error) {
              console.error("Failed to copy plain text:", error);
              toast.error("Failed to copy");
            }
          },
        },
        {
          id: "copy-html",
          label: "Copy HTML",
          icon: <CopyIcon className="w-4.5 h-4.5 stroke-[1.5]" />,
          action: async () => {
            try {
              if (!editorRef?.current) {
                toast.error("Editor not available");
                return;
              }
              const html = editorRef.current.getHTML();
              await invoke("copy_to_clipboard", { text: html });
              toast.success("Copied as HTML");
              onClose();
            } catch (error) {
              console.error("Failed to copy HTML:", error);
              toast.error("Failed to copy");
            }
          },
        },
        {
          id: "download-pdf",
          label: "Print as PDF",
          icon: <DownloadIcon className="w-4.5 h-4.5 stroke-[1.5]" />,
          action: async () => {
            try {
              if (!currentNote) {
                toast.error("No note selected");
                return;
              }
              await flushPendingSave?.();
              await downloadPdf(currentNote.path);
              onClose();
            } catch (error) {
              console.error("Failed to open print dialog:", error);
              toast.error("Failed to open print dialog");
            }
          },
        },
        {
          id: "download-markdown",
          label: "Export Markdown",
          icon: <DownloadIcon className="w-4.5 h-4.5 stroke-[1.5]" />,
          action: async () => {
            try {
              if (!currentNote) {
                toast.error("No note selected");
                return;
              }
              // Use live editor content with nbsp cleanup, fall back to saved content
              let markdown = currentNote.content;
              const editorInstance = editorRef?.current;
              if (editorInstance) {
                const manager = editorInstance.storage.markdown?.manager;
                if (manager) {
                  markdown = manager.serialize(editorInstance.getJSON());
                  markdown = markdown.replace(/&nbsp;|&#160;/g, " ");
                } else {
                  markdown = editorInstance.getText();
                }
              }
              const saved = await downloadMarkdown(markdown, currentNote.title);
              if (saved) {
                toast.success("Markdown saved successfully");
                onClose();
              }
            } catch (error) {
              console.error("Failed to download markdown:", error);
              toast.error("Failed to save markdown");
            }
          },
        },
      );
    }

    // Add git commands when git integration is visible and initialized
    if (gitEnabled && gitAvailable && status?.isRepo) {
      const hasChanges = (status?.changedCount ?? 0) > 0;
      const canSync = status?.hasRemote && status?.hasUpstream && !isSyncing;

      if (hasChanges) {
        baseCommands.push({
          id: "git-commit",
          label: "Git: Quick Commit",
          icon: <GitCommitIcon className="w-4.5 h-4.5 stroke-[1.5]" />,
          action: async () => {
            const success = await commit("Quick commit from Sly");
            if (success) {
              toast.success("Changes committed");
            } else {
              toast.error("Failed to commit");
            }
            onClose();
          },
        });
      }

      if (canSync) {
        baseCommands.push({
          id: "git-sync",
          label: "Git: Sync (Pull and Push)",
          icon: <RefreshCwIcon className="w-4.5 h-4.5 stroke-[1.5]" />,
          action: async () => {
            const result = await sync();
            if (result.ok) {
              toast.success(result.message);
            } else {
              toast.error(result.error);
            }
            onClose();
          },
        });
      }
    }

    // Focus mode and source toggle
    baseCommands.push(
      {
        id: "toggle-outline-panel",
        label: `${rightPanelVisible ? "Hide" : "Show"} Right Panel`,
        shortcut: `${mod} 4`,
        icon: <PanelRight className="w-4.5 h-4.5 stroke-[1.5]" />,
        action: () => {
          onToggleRightPanel?.();
          onClose();
        },
      },
      {
        id: "focus-mode",
        label: focusMode ? "Exit Focus Mode" : "Enter Focus Mode",
        shortcut: `${mod} ${shift} Enter`,
        icon: <ZenIcon className="w-4.5 h-4.5 stroke-[1.5]" />,
        action: () => {
          onToggleFocusMode?.();
          onClose();
        },
      },
      {
        id: "toggle-source",
        label: "Toggle Markdown Source",
        shortcut: `${mod} ${shift} M`,
        icon: <MarkdownIcon className="w-4.5 h-4.5 stroke-[1.5]" />,
        action: () => {
          window.dispatchEvent(new CustomEvent("toggle-source-mode"));
          onClose();
        },
      },
    );

    // Open notes folder
    if (notesFolder) {
      baseCommands.push({
        id: "open-folder",
        label: "Open Notes Folder",
        icon: <FolderIcon className="w-4.5 h-4.5 stroke-[1.5]" />,
        action: async () => {
          try {
            await invoke("open_in_file_manager", { path: notesFolder });
            onClose();
          } catch (error) {
            console.error("Failed to open folder:", error);
            toast.error("Failed to open folder");
          }
        },
      });
    }

    // Settings and theme commands at the bottom
    baseCommands.push(
      {
        id: "settings",
        label: "Settings",
        shortcut: `${mod} ,`,
        icon: <SettingsIcon className="w-4.5 h-4.5 stroke-[1.5]" />,
        action: () => {
          onOpenSettings?.();
          onClose();
        },
      },
      {
        id: "theme-light",
        label: `Switch Theme to Light Mode`,
        icon: <SwatchIcon className="w-4.5 h-4.5 stroke-[1.5]" />,
        action: () => {
          setTheme("light");
          onClose();
        },
      },
      {
        id: "theme-dark",
        label: `Switch Theme to Dark Mode`,
        icon: <SwatchIcon className="w-4.5 h-4.5 stroke-[1.5]" />,
        action: () => {
          setTheme("dark");
          onClose();
        },
      },
      {
        id: "theme-system",
        label: `Switch Theme to System Mode`,
        icon: <SwatchIcon className="w-4.5 h-4.5 stroke-[1.5]" />,
        action: () => {
          setTheme("system");
          onClose();
        },
      },
    );

    return baseCommands;
  }, [
    createNote,
    currentNote,
    confirmDeletions,
    deleteNote,
    editorRef,
    flushPendingSave,
    onClose,
    onOpenSettings,
    setTheme,
    gitEnabled,
    gitAvailable,
    status,
    commit,
    sync,
    isSyncing,
    selectNote,
    refreshNotes,
    settings,
    pinNote,
    unpinNote,
    focusMode,
    onToggleFocusMode,
    onToggleRightPanel,
    rightPanelVisible,
    notesFolder,
  ]);

  // Debounced search using Tantivy (local state, doesn't affect sidebar)
  useEffect(() => {
    if (!open) return;

    const trimmed = query.trim();
    if (!trimmed) {
      setLocalSearchResults([]);
      return;
    }

    // Debounce search calls
    const timer = setTimeout(async () => {
      try {
        const results = await invoke<
          {
            id: string;
            title: string;
            preview: string;
            modified: number;
            score: number;
          }[]
        >("search_notes", { query: trimmed });
        setLocalSearchResults(results);
      } catch (err) {
        console.error("Search failed:", err);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [query, open]);

  // Clear local search when palette closes
  useEffect(() => {
    if (!open) {
      setLocalSearchResults([]);
    }
  }, [open]);

  // Use search results when searching, otherwise show all notes
  const filteredNotes = useMemo(() => {
    if (!query.trim()) return notes;
    return localSearchResults;
  }, [query, notes, localSearchResults]);

  // Memoize filtered commands
  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands;
    const queryLower = query.toLowerCase();
    return commands.filter((cmd) =>
      cmd.label.toLowerCase().includes(queryLower),
    );
  }, [query, commands]);

  // Memoize all items (commands first, then notes)
  const allItems = useMemo(
    () => [
      ...filteredCommands.map((cmd) => ({
        type: "command" as const,
        id: cmd.id,
        label: cmd.label,
        shortcut: cmd.shortcut,
        icon: cmd.icon,
        action: cmd.action,
      })),
      ...filteredNotes.slice(0, 10).map((note) => ({
        type: "note" as const,
        id: note.id,
        label: cleanTitle(note.title),
        preview: note.preview,
        action: () => {
          selectNote(note.id);
          onClose();
        },
      })),
    ],
    [filteredNotes, filteredCommands, selectNote, onClose],
  );

  // Reset state when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Reset selection when items change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selectedItem = listRef.current.querySelector(
        `[data-index="${selectedIndex}"]`,
      );
      selectedItem?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  const handleDeleteConfirm = useCallback(async () => {
    if (noteToDelete) {
      if (dontAskAgain) setConfirmDeletions(false);
      try {
        await deleteNote(noteToDelete);
        setNoteToDelete(null);
        setDeleteDialogOpen(false);
        onClose();
      } catch (error) {
        console.error("Failed to delete note:", error);
        toast.error("Failed to delete note");
      }
    }
  }, [noteToDelete, deleteNote, onClose, dontAskAgain, setConfirmDeletions]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          e.stopPropagation();
          setSelectedIndex((i) => Math.min(i + 1, allItems.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          e.stopPropagation();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          e.stopPropagation();
          if (allItems[selectedIndex]) {
            allItems[selectedIndex].action();
          }
          break;
        case "Escape":
          e.preventDefault();
          e.stopPropagation();
          onClose();
          break;
      }
    },
    [allItems, selectedIndex, onClose],
  );

  if (!open) return null;

  const commandsCount = filteredCommands.length;

  return (
    <>
      <DialogShell
        onBackdropClick={onClose}
        panelClassName="max-w-2xl h-full max-h-108 flex flex-col"
      >
        {/* Search input */}
        <div className="border-b border-border flex-none">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search notes or type a command..."
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="h-[var(--ui-control-height-prominent)] w-full border-0 bg-transparent px-4 py-3 text-[17px] text-text placeholder:text-text-muted/50 outline-none"
          />
        </div>

        {/* Results */}
        <div
          ref={listRef}
          className="ui-scrollbar-overlay overflow-y-auto h-full p-2.5 flex-1"
        >
          {allItems.length === 0 ? (
            <div className="text-sm font-medium opacity-50 text-text-muted p-2">
              No results found
            </div>
          ) : (
            <>
              {/* Commands section */}
              {filteredCommands.length > 0 && (
                <div className="space-y-1 mb-5">
                  <div className="text-sm font-medium text-text-muted px-2.5 py-1.5">
                    Commands
                  </div>
                  {filteredCommands.map((cmd, i) => {
                    return (
                      <div key={cmd.id} data-index={i}>
                        <CommandItem
                          label={cmd.label}
                          shortcut={cmd.shortcut}
                          icon={cmd.icon}
                          isSelected={selectedIndex === i}
                          onClick={cmd.action}
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Notes section */}
              {filteredNotes.length > 0 && (
                <div className="space-y-1">
                  <div className="text-sm font-medium text-text-muted px-2.5 py-1.5">
                    Notes
                  </div>
                  {filteredNotes.slice(0, 10).map((note, i) => {
                    const title = cleanTitle(note.title);
                    const firstLetter = getDisplayInitial(note.title);
                    const cleanSubtitle = cleanPreviewText(note.preview);
                    const index = commandsCount + i;
                    return (
                      <div key={note.id} data-index={index}>
                        <CommandItem
                          label={title}
                          subtitle={cleanSubtitle}
                          iconText={firstLetter}
                          variant="note"
                          isSelected={selectedIndex === index}
                          onClick={allItems[index].action}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </DialogShell>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete note?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the note and all its content. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label
            htmlFor={dontAskAgainId}
            className="flex items-center gap-2 pt-1 cursor-pointer select-none"
          >
            <Checkbox
              id={dontAskAgainId}
              checked={dontAskAgain}
              onCheckedChange={(checked) => setDontAskAgain(checked === true)}
            />
            <span className="text-sm text-text-muted">Don't ask again</span>
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

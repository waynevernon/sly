import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { useDraggable } from "@dnd-kit/core";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { Clock3, Search, SquareArrowOutUpRight } from "lucide-react";
import { toast } from "sonner";
import { useNotes } from "../../context/NotesContext";
import { useTheme } from "../../context/ThemeContext";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Checkbox,
  Input,
  ListItem,
  PanelEmptyState,
  destructiveMenuItemClassName,
  menuItemClassName,
  menuSeparatorClassName,
  menuSurfaceClassName,
} from "../ui";
import { cleanPreviewText, cleanTitle } from "../../lib/utils";
import { sanitizeNoteFilename } from "../../lib/noteIdentity";
import * as notesService from "../../services/notes";
import {
  AddNoteIcon,
  CopyIcon,
  NoteIcon,
  PinIcon,
  PencilIcon,
  TrashIcon,
  XIcon,
} from "../icons";

export interface NoteListItem {
  id: string;
  title: string;
  preview: string;
  modified: number;
  created: number;
}

export interface NoteListEmptyState {
  kind: "notes" | "search" | "recent" | "pinned";
  title: string;
  message: string;
}

interface NoteListProps {
  items: NoteListItem[];
  emptyState: NoteListEmptyState;
}

function NoteListEmptyStateIcon({ kind }: Pick<NoteListEmptyState, "kind">) {
  if (kind === "search") {
    return <Search />;
  }
  if (kind === "recent") {
    return <Clock3 />;
  }
  if (kind === "pinned") {
    return <PinIcon />;
  }
  return <AddNoteIcon />;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const now = new Date();

  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const startOfYesterday = new Date(startOfToday.getTime() - 86400000);

  if (date >= startOfToday) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  if (date >= startOfYesterday) {
    return "Yesterday";
  }

  const daysAgo =
    Math.floor((startOfToday.getTime() - date.getTime()) / 86400000) + 1;
  if (daysAgo <= 6) {
    return `${daysAgo} days ago`;
  }

  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getNoteFilename(id: string): string {
  const baseName = id.includes("/") ? id.substring(id.lastIndexOf("/") + 1) : id;
  return `${baseName}.md`;
}

function getNoteLeaf(id: string): string {
  return id.includes("/") ? id.substring(id.lastIndexOf("/") + 1) : id;
}

function getNoteOptionId(id: string): string {
  return `note-option-${encodeURIComponent(id)}`;
}

type SelectionState = "none" | "selected" | "active";

interface NoteItemProps {
  optionId: string;
  id: string;
  title: string;
  preview?: string;
  modified: number;
  created: number;
  selectionState: SelectionState;
  isPinned: boolean;
  onSelect: (
    id: string,
    event: {
      shiftKey: boolean;
      metaKey: boolean;
      ctrlKey: boolean;
    },
  ) => void;
  noteListDateMode: "modified" | "created" | "off";
  noteListPreviewLines: 0 | 1 | 2 | 3;
  showNoteListFilename: boolean;
  showNoteListFolderPath: boolean;
}

const NoteItem = memo(function NoteItem({
  optionId,
  id,
  title,
  preview,
  modified,
  created,
  selectionState,
  isPinned,
  onSelect,
  noteListDateMode,
  noteListPreviewLines,
  showNoteListFilename,
  showNoteListFolderPath,
}: NoteItemProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectionState === "active") {
      ref.current?.scrollIntoView({ block: "nearest" });
    }
  }, [selectionState]);

  const folder =
    showNoteListFolderPath && id.includes("/")
      ? id.substring(0, id.lastIndexOf("/"))
      : null;
  const filename = showNoteListFilename ? getNoteFilename(id) : "";
  const previewText =
    noteListPreviewLines > 0 ? cleanPreviewText(preview) : "";
  const pathLabel = folder
    ? filename
      ? `${folder}/${filename}`
      : `${folder}/`
    : filename;
  const timestamp =
    noteListDateMode === "created"
      ? created
      : noteListDateMode === "modified"
        ? modified
        : null;
  const subtitleLines: 1 | 2 | 3 | undefined =
    noteListPreviewLines === 0 ? undefined : noteListPreviewLines;
  const metaText = [timestamp === null ? null : formatDate(timestamp), pathLabel]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      ref={ref}
      id={optionId}
      role="option"
      aria-selected={selectionState !== "none"}
      tabIndex={-1}
      onClick={(event) =>
        onSelect(id, {
          shiftKey: event.shiftKey,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
        })
      }
    >
      <ListItem
        title={cleanTitle(title)}
        subtitle={previewText || undefined}
        meta={metaText || undefined}
        subtitleLines={subtitleLines}
        secondaryOrder="subtitle-first"
        selectionState={selectionState}
        isPinned={isPinned}
        className="cursor-default"
      />
    </div>
  );
});

interface NoteItemWithMenuProps extends Omit<NoteItemProps, "optionId"> {
  selectedNoteIds: string[];
  dragIds: string[];
  onPin: (id: string) => Promise<void>;
  onUnpin: (id: string) => Promise<void>;
  onDuplicate: (id: string) => void;
  onRenameFile: (id: string) => void;
  onOpenInNewWindow: (id: string) => void;
  onDelete: (ids: string[]) => void;
  onClearSelection: () => void;
  onFocusList: () => void;
}

const NoteItemWithMenu = memo(function NoteItemWithMenu({
  id,
  title,
  preview,
  modified,
  created,
  selectionState,
  isPinned,
  selectedNoteIds,
  dragIds,
  onSelect,
  onPin,
  onUnpin,
  onDuplicate,
  onRenameFile,
  onOpenInNewWindow,
  onDelete,
  onClearSelection,
  onFocusList,
  noteListDateMode,
  noteListPreviewLines,
  showNoteListFilename,
  showNoteListFolderPath,
}: NoteItemWithMenuProps) {
  const isPartOfBatchSelection =
    selectedNoteIds.length > 1 && selectedNoteIds.includes(id);

  const handlePin = useCallback(async () => {
    try {
      await (isPinned ? onUnpin(id) : onPin(id));
    } catch (error) {
      console.error("Failed to pin/unpin note:", error);
    }
  }, [id, isPinned, onPin, onUnpin]);

  const handleCopyFilepath = useCallback(async () => {
    try {
      const folder = await notesService.getNotesFolder();
      if (folder) {
        await invoke("copy_to_clipboard", { text: `${folder}/${id}.md` });
      }
    } catch (error) {
      console.error("Failed to copy filepath:", error);
    }
  }, [id]);

  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging,
  } = useDraggable({
    id: `note:${id}`,
    data: { type: "note", id, ids: dragIds },
  });

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div
          ref={setNodeRef}
          {...attributes}
          {...listeners}
          className={isDragging ? "opacity-40" : ""}
          onContextMenu={() => {
            onFocusList();
            if (!isPartOfBatchSelection) {
              onSelect(id, {
                shiftKey: false,
                metaKey: false,
                ctrlKey: false,
              });
            }
          }}
        >
          <NoteItem
            optionId={getNoteOptionId(id)}
            id={id}
            title={title}
            preview={preview}
            modified={modified}
            created={created}
            selectionState={selectionState}
            isPinned={isPinned}
            onSelect={onSelect}
            noteListDateMode={noteListDateMode}
            noteListPreviewLines={noteListPreviewLines}
            showNoteListFilename={showNoteListFilename}
            showNoteListFolderPath={showNoteListFolderPath}
          />
        </div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          className={`${menuSurfaceClassName} min-w-44 z-50`}
        >
          {isPartOfBatchSelection ? (
            <>
              <ContextMenu.Item
                className={destructiveMenuItemClassName}
                onSelect={() => onDelete(selectedNoteIds)}
              >
                <TrashIcon className="w-4 h-4 stroke-[1.6]" />
                Delete Selected Notes
              </ContextMenu.Item>
              <ContextMenu.Item
                className={menuItemClassName}
                onSelect={onClearSelection}
              >
                <XIcon className="w-4 h-4 stroke-[1.6]" />
                Clear Selection
              </ContextMenu.Item>
            </>
          ) : (
            <>
              <ContextMenu.Item
                className={menuItemClassName}
                onSelect={() => onOpenInNewWindow(id)}
              >
                <SquareArrowOutUpRight className="w-4 h-4 stroke-[1.6]" />
                Open in New Window
              </ContextMenu.Item>
              <ContextMenu.Item className={menuItemClassName} onSelect={handlePin}>
                <PinIcon className="w-4 h-4 stroke-[1.6]" />
                {isPinned ? "Unpin" : "Pin"}
              </ContextMenu.Item>
              <ContextMenu.Item
                className={menuItemClassName}
                onSelect={() => onDuplicate(id)}
              >
                <CopyIcon className="w-4 h-4 stroke-[1.6]" />
                Duplicate
              </ContextMenu.Item>
              <ContextMenu.Item
                className={menuItemClassName}
                onSelect={() => onRenameFile(id)}
              >
                <PencilIcon className="w-4 h-4 stroke-[1.6]" />
                Rename File…
              </ContextMenu.Item>
              <ContextMenu.Item
                className={menuItemClassName}
                onSelect={handleCopyFilepath}
              >
                <CopyIcon className="w-4 h-4 stroke-[1.6]" />
                Copy Filepath
              </ContextMenu.Item>
              <ContextMenu.Separator className={menuSeparatorClassName} />
              <ContextMenu.Item
                className={destructiveMenuItemClassName}
                onSelect={() => onDelete([id])}
              >
                <TrashIcon className="w-4 h-4 stroke-[1.6]" />
                Delete
              </ContextMenu.Item>
            </>
          )}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
});

function getDeleteDialogCopy(noteIds: string[]) {
  if (noteIds.length === 1) {
    return {
      title: "Delete note?",
      description:
        "This will permanently delete the note and all its content. This action cannot be undone.",
      actionLabel: "Delete",
    };
  }

  return {
    title: `Delete ${noteIds.length} notes?`,
    description: `This will permanently delete ${noteIds.length} selected notes and all of their content. This action cannot be undone.`,
    actionLabel: `Delete ${noteIds.length}`,
  };
}

export function NoteList({
  items,
  emptyState,
}: NoteListProps) {
  const {
    selectedNoteId,
    selectedNoteIds,
    selectNote,
    toggleNoteSelection,
    selectNoteRange,
    clearNoteSelection,
    deleteNote,
    deleteSelectedNotes,
    duplicateNote,
    renameNote,
    pinNote,
    unpinNote,
    notes,
    isLoading,
    noteListDateMode,
    noteListPreviewLines,
    showNoteListFilename,
    showNoteListFolderPath,
    settings,
  } = useNotes();

  const { confirmDeletions, setConfirmDeletions } = useTheme();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [noteIdsToDelete, setNoteIdsToDelete] = useState<string[]>([]);
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [noteIdToRename, setNoteIdToRename] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [suggestedName, setSuggestedName] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const dontAskAgainId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const pinnedIds = useMemo(
    () => new Set(settings.pinnedNoteIds || []),
    [settings],
  );
  const selectedNoteIdSet = useMemo(
    () => new Set(selectedNoteIds),
    [selectedNoteIds],
  );
  const activeOptionId = useMemo(() => {
    const activeId = selectedNoteId ?? selectedNoteIds[0];
    return activeId ? getNoteOptionId(activeId) : undefined;
  }, [selectedNoteId, selectedNoteIds]);

  const focusList = useCallback(() => {
    containerRef.current?.focus();
  }, []);

  const handleSelect = useCallback(
    (
      id: string,
      event: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean },
    ) => {
      focusList();
      if (event.shiftKey) {
        selectNoteRange(id);
        return;
      }
      if (event.metaKey || event.ctrlKey) {
        toggleNoteSelection(id);
        return;
      }
      void selectNote(id);
    },
    [focusList, selectNote, selectNoteRange, toggleNoteSelection],
  );

  const runDelete = useCallback(
    async (noteIds: string[]) => {
      if (noteIds.length <= 1) {
        if (noteIds[0]) {
          await deleteNote(noteIds[0]);
        }
      } else {
        await deleteSelectedNotes();
      }
    },
    [deleteNote, deleteSelectedNotes],
  );

  const handleDeleteConfirm = useCallback(async () => {
    if (noteIdsToDelete.length === 0) return;

    if (dontAskAgain) setConfirmDeletions(false);
    try {
      await runDelete(noteIdsToDelete);
      setNoteIdsToDelete([]);
      setDeleteDialogOpen(false);
    } catch (error) {
      console.error("Failed to delete note(s):", error);
    }
  }, [
    dontAskAgain,
    noteIdsToDelete,
    runDelete,
    setConfirmDeletions,
  ]);

  const openDeleteDialogForNotes = useCallback(
    async (noteIds: string[]) => {
      if (noteIds.length === 0) return;

      focusList();

      if (!confirmDeletions) {
        try {
          await runDelete(noteIds);
        } catch (error) {
          console.error("Failed to delete note(s):", error);
        }
        return;
      }

      setDontAskAgain(false);
      setNoteIdsToDelete(noteIds);
      setDeleteDialogOpen(true);
    },
    [confirmDeletions, focusList, runDelete],
  );

  const openRenameDialog = useCallback(
    (noteId: string) => {
      focusList();
      const baseName = getNoteLeaf(noteId);
      const note = notes.find((n) => n.id === noteId);
      const suggested = note ? sanitizeNoteFilename(note.title) : null;
      setNoteIdToRename(noteId);
      setRenameValue(baseName);
      setSuggestedName(suggested !== baseName ? suggested : null);
      setRenameDialogOpen(true);
    },
    [focusList, notes],
  );

  const closeRenameDialog = useCallback(() => {
    if (isRenaming) return;
    setRenameDialogOpen(false);
    setNoteIdToRename(null);
    setRenameValue("");
    setSuggestedName(null);
  }, [isRenaming]);

  const handleRenameConfirm = useCallback(async () => {
    if (!noteIdToRename) return;

    const trimmed = renameValue.trim();
    if (!trimmed) {
      closeRenameDialog();
      return;
    }

    const currentLeaf = getNoteLeaf(noteIdToRename);
    if (trimmed === currentLeaf || trimmed === `${currentLeaf}.md`) {
      closeRenameDialog();
      return;
    }

    try {
      setIsRenaming(true);
      await renameNote(noteIdToRename, trimmed);
      setRenameDialogOpen(false);
      setNoteIdToRename(null);
      setRenameValue("");
      toast.success("Filename updated");
    } catch (error) {
      console.error("Failed to rename note file:", error);
      toast.error("Failed to rename file");
    } finally {
      setIsRenaming(false);
    }
  }, [closeRenameDialog, noteIdToRename, renameNote, renameValue]);

  useEffect(() => {
    const handleFocusNoteList = () => {
      focusList();
    };

    window.addEventListener("focus-note-list", handleFocusNoteList);
    return () =>
      window.removeEventListener("focus-note-list", handleFocusNoteList);
  }, [focusList]);

  useEffect(() => {
    if (!renameDialogOpen) return;

    const frame = requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });

    return () => cancelAnimationFrame(frame);
  }, [renameDialogOpen]);

  useEffect(() => {
    const handleRequestDelete = (event: Event) => {
      const customEvent = event as CustomEvent<string | string[]>;
      if (!customEvent.detail) return;
      const noteIds = Array.isArray(customEvent.detail)
        ? customEvent.detail
        : [customEvent.detail];
      void openDeleteDialogForNotes(noteIds);
    };

    window.addEventListener("request-delete-note", handleRequestDelete);
    return () =>
      window.removeEventListener("request-delete-note", handleRequestDelete);
  }, [openDeleteDialogForNotes]);

  if (isLoading && items.length === 0) {
    return (
      <div className="p-4 text-center text-text-muted select-none">
        Loading...
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex min-h-full">
        <PanelEmptyState
          icon={<NoteListEmptyStateIcon kind={emptyState.kind} />}
          title={emptyState.title}
          message={emptyState.message}
        />
      </div>
    );
  }

  const deleteDialogCopy = getDeleteDialogCopy(noteIdsToDelete);

  return (
    <>
      <div
        ref={containerRef}
        tabIndex={0}
        role="listbox"
        aria-label="Notes"
        aria-multiselectable={true}
        aria-activedescendant={activeOptionId}
        data-note-list
        className="group/notelist flex flex-col gap-1 p-1.5 outline-none"
        onMouseDown={(event) => {
          if (event.button === 0 || event.button === 2) {
            focusList();
          }
        }}
      >
        {items.map((item) => {
          const selectionState: SelectionState =
            selectedNoteId === item.id
              ? "active"
              : selectedNoteIdSet.has(item.id)
                ? "selected"
                : "none";
          const dragIds =
            selectedNoteIds.length > 1 && selectedNoteIdSet.has(item.id)
              ? selectedNoteIds
              : [item.id];

          return (
            <NoteItemWithMenu
              key={item.id}
              id={item.id}
              title={item.title}
              preview={item.preview}
              modified={item.modified}
              created={item.created}
              selectionState={selectionState}
              isPinned={pinnedIds.has(item.id)}
              selectedNoteIds={selectedNoteIds}
              dragIds={dragIds}
              onSelect={handleSelect}
              onPin={pinNote}
              onUnpin={unpinNote}
              onDuplicate={duplicateNote}
              onRenameFile={openRenameDialog}
              onOpenInNewWindow={(noteId) => {
                void notesService
                  .openNoteWindow(noteId)
                  .catch((error) => {
                    console.error("Failed to open note window:", error);
                    toast.error("Failed to open note in new window");
                  });
              }}
              onDelete={(ids) => {
                void openDeleteDialogForNotes(ids);
              }}
              onClearSelection={clearNoteSelection}
              onFocusList={focusList}
              noteListDateMode={noteListDateMode}
              noteListPreviewLines={noteListPreviewLines}
              showNoteListFilename={showNoteListFilename}
              showNoteListFolderPath={showNoteListFolderPath}
            />
          );
        })}
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteDialogCopy.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteDialogCopy.description}
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
              {deleteDialogCopy.actionLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={renameDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeRenameDialog();
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rename file</AlertDialogTitle>
            <AlertDialogDescription>
              Choose a new file name. The `.md` extension is kept automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-3">
            <Input
              ref={renameInputRef}
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              placeholder="Untitled"
              disabled={isRenaming}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleRenameConfirm();
                }
              }}
            />
            <button
              type="button"
              className={`self-start text-xs text-text-muted hover:text-text underline underline-offset-2 decoration-text-muted/50 hover:decoration-text text-left transition-colors truncate max-w-full ${suggestedName && suggestedName !== renameValue ? "visible" : "invisible pointer-events-none"}`}
              onClick={() => suggestedName && setRenameValue(suggestedName)}
            >
              Use title: <span className="font-medium">{suggestedName ?? ""}</span>
            </button>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRenaming}>Cancel</AlertDialogCancel>
            <Button
              onClick={handleRenameConfirm}
              disabled={
                isRenaming ||
                !renameValue.trim() ||
                (noteIdToRename !== null &&
                  (renameValue.trim() === getNoteLeaf(noteIdToRename) ||
                    renameValue.trim() === `${getNoteLeaf(noteIdToRename)}.md`))
              }
            >
              {isRenaming ? "Renaming..." : "Rename"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

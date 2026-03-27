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
  Checkbox,
  ListItem,
  destructiveMenuItemClassName,
  menuItemClassName,
  menuSeparatorClassName,
  menuSurfaceClassName,
} from "../ui";
import { cleanPreviewText, cleanTitle } from "../../lib/utils";
import * as notesService from "../../services/notes";
import { CopyIcon, PinIcon, TrashIcon, XIcon } from "../icons";

export interface NoteListItem {
  id: string;
  title: string;
  preview: string;
  modified: number;
  created: number;
}

interface NoteListProps {
  items: NoteListItem[];
  emptyMessage: string;
  showFolderPrefix?: boolean;
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

type SelectionState = "none" | "selected" | "active";

interface NoteItemProps {
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
  showFolderPrefix?: boolean;
  noteListDateMode: "modified" | "created" | "off";
  noteListPreviewLines: 0 | 1 | 2 | 3;
  showNoteListFilename: boolean;
  showNoteListFolderPath: boolean;
}

const NoteItem = memo(function NoteItem({
  id,
  title,
  preview,
  modified,
  created,
  selectionState,
  isPinned,
  onSelect,
  showFolderPrefix = true,
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
    showFolderPrefix && showNoteListFolderPath && id.includes("/")
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

  return (
    <div
      ref={ref}
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
        subtitlePrefix={pathLabel || undefined}
        subtitle={previewText || undefined}
        meta={timestamp === null ? undefined : formatDate(timestamp)}
        subtitleLines={noteListPreviewLines > 0 ? noteListPreviewLines : 1}
        selectionState={selectionState}
        isPinned={isPinned}
      />
    </div>
  );
});

interface NoteItemWithMenuProps extends NoteItemProps {
  selectedNoteIds: string[];
  dragIds: string[];
  onPin: (id: string) => Promise<void>;
  onUnpin: (id: string) => Promise<void>;
  onDuplicate: (id: string) => void;
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
  onDelete,
  onClearSelection,
  onFocusList,
  showFolderPrefix = true,
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
            id={id}
            title={title}
            preview={preview}
            modified={modified}
            created={created}
            selectionState={selectionState}
            isPinned={isPinned}
            onSelect={onSelect}
            showFolderPrefix={showFolderPrefix}
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
  emptyMessage,
  showFolderPrefix = true,
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
    pinNote,
    unpinNote,
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
  const dontAskAgainId = useId();
  const containerRef = useRef<HTMLDivElement>(null);

  const pinnedIds = useMemo(
    () => new Set(settings.pinnedNoteIds || []),
    [settings],
  );
  const selectedNoteIdSet = useMemo(
    () => new Set(selectedNoteIds),
    [selectedNoteIds],
  );

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

  useEffect(() => {
    const handleFocusNoteList = () => {
      focusList();
    };

    window.addEventListener("focus-note-list", handleFocusNoteList);
    return () =>
      window.removeEventListener("focus-note-list", handleFocusNoteList);
  }, [focusList]);

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
      <div className="px-4 py-6 text-center text-sm text-text-muted select-none">
        {emptyMessage}
      </div>
    );
  }

  const deleteDialogCopy = getDeleteDialogCopy(noteIdsToDelete);

  return (
    <>
      <div
        ref={containerRef}
        tabIndex={0}
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
              onDelete={(ids) => {
                void openDeleteDialogForNotes(ids);
              }}
              onClearSelection={clearNoteSelection}
              onFocusList={focusList}
              showFolderPrefix={showFolderPrefix}
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
    </>
  );
}

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { toast } from "sonner";
import { useNotes } from "../../context/NotesContext";
import { buildFolderTree, countNotesInFolder } from "../../lib/folderTree";
import type { FolderNode } from "../../types/note";
import * as notesService from "../../services/notes";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui";
import { FolderNameDialog } from "./FolderNameDialog";
import {
  AddNoteIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FolderIcon,
  FolderPlusIcon,
  PencilIcon,
  TrashIcon,
} from "../icons";

const STORAGE_KEY = "scratch:collapsedFolders";

const menuItemClass =
  "px-3 py-1.5 text-sm text-text cursor-pointer outline-none hover:bg-bg-muted focus:bg-bg-muted flex items-center gap-2 rounded-sm";

const menuSeparatorClass = "h-px bg-border my-1";

function loadCollapsedFolders(): Set<string> {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? new Set(JSON.parse(saved)) : new Set();
  } catch {
    return new Set();
  }
}

function saveCollapsedFolders(folders: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...folders]));
  } catch {
    // Ignore localStorage failures.
  }
}

interface FolderItemProps {
  folder: FolderNode;
  depth: number;
  selectedFolderPath: string | null;
  collapsedFolders: Set<string>;
  onToggleCollapse: (path: string) => void;
  onSelectFolder: (path: string) => void;
  onCreateNoteHere: (path: string) => void;
  onNewSubfolder: (parentPath: string) => void;
  onRenameFolder: (path: string, currentName: string) => void;
  onDeleteFolder: (path: string) => void;
  onMoveFolderToParent: (path: string, targetParent: string) => void;
}

const FolderItem = memo(function FolderItem({
  folder,
  depth,
  selectedFolderPath,
  collapsedFolders,
  onToggleCollapse,
  onSelectFolder,
  onCreateNoteHere,
  onNewSubfolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveFolderToParent,
}: FolderItemProps) {
  const isCollapsed = collapsedFolders.has(folder.path);
  const noteCount = countNotesInFolder(folder);

  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: `folder:${folder.path}`,
    data: { type: "folder", path: folder.path },
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `drop-folder:${folder.path}`,
    data: { type: "folder", path: folder.path },
  });

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div>
          <div
            ref={(node) => {
              setDragRef(node);
              setDropRef(node);
            }}
            {...attributes}
            {...listeners}
            className={`rounded-md transition-[background-color,opacity,transform] duration-200 ${
              isDragging ? "opacity-40" : ""
            } ${
              isOver
                ? "bg-accent/12 ring-1 ring-accent/60"
                : selectedFolderPath === folder.path
                  ? "bg-bg-muted"
                  : "hover:bg-bg-muted/80"
            }`}
            style={{ marginLeft: `${depth * 12}px` }}
          >
            <div className="flex items-center gap-1.5 pr-2 py-1.5">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleCollapse(folder.path);
                }}
                className="ml-2 h-5 w-5 rounded-sm text-text-muted/70 hover:bg-bg-muted/80 flex items-center justify-center shrink-0"
                aria-label={isCollapsed ? "Expand folder" : "Collapse folder"}
              >
                {isCollapsed ? (
                  <ChevronRightIcon className="w-4 h-4 stroke-[1.6]" />
                ) : (
                  <ChevronDownIcon className="w-4 h-4 stroke-[1.6]" />
                )}
              </button>
              <button
                type="button"
                onClick={() => onSelectFolder(folder.path)}
                className="min-w-0 flex-1 flex items-center gap-2 text-left"
              >
                <FolderIcon className="w-4.25 h-4.25 stroke-[1.6] text-text-muted/80 shrink-0" />
                <span className="text-sm text-text truncate">{folder.name}</span>
              </button>
              <span className="text-2xs font-medium text-text-muted/70 shrink-0 px-1.5 py-0.5 rounded-full bg-bg/70">
                {noteCount}
              </span>
            </div>
          </div>

          {!isCollapsed && folder.children.length > 0 && (
            <div className="flex flex-col gap-0.5 pt-0.5">
              {folder.children.map((child) => (
                <FolderItem
                  key={child.path}
                  folder={child}
                  depth={depth + 1}
                  selectedFolderPath={selectedFolderPath}
                  collapsedFolders={collapsedFolders}
                  onToggleCollapse={onToggleCollapse}
                  onSelectFolder={onSelectFolder}
                  onCreateNoteHere={onCreateNoteHere}
                  onNewSubfolder={onNewSubfolder}
                  onRenameFolder={onRenameFolder}
                  onDeleteFolder={onDeleteFolder}
                  onMoveFolderToParent={onMoveFolderToParent}
                />
              ))}
            </div>
          )}
        </div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="min-w-44 bg-bg border border-border rounded-md shadow-lg py-1 z-50">
          <ContextMenu.Item
            className={menuItemClass}
            onSelect={() => onCreateNoteHere(folder.path)}
          >
            <AddNoteIcon className="w-4 h-4 stroke-[1.6]" />
            New Note
          </ContextMenu.Item>
          <ContextMenu.Item
            className={menuItemClass}
            onSelect={() => onNewSubfolder(folder.path)}
          >
            <FolderPlusIcon className="w-4 h-4 stroke-[1.6]" />
            New Subfolder
          </ContextMenu.Item>
          <ContextMenu.Separator className={menuSeparatorClass} />
          <ContextMenu.Item
            className={menuItemClass}
            onSelect={() =>
              onRenameFolder(folder.path, folder.path.split("/").pop() || folder.path)
            }
          >
            <PencilIcon className="w-4 h-4 stroke-[1.6]" />
            Rename
          </ContextMenu.Item>
          {folder.path.includes("/") && (
            <>
              <ContextMenu.Separator className={menuSeparatorClass} />
              <ContextMenu.Item
                className={menuItemClass}
                onSelect={() =>
                  onMoveFolderToParent(folder.path, folder.path.split("/").slice(0, -2).join("/"))
                }
              >
                <ArrowUpIcon className="w-4 h-4 stroke-[1.6]" />
                Move to Parent Folder
              </ContextMenu.Item>
            </>
          )}
          <ContextMenu.Separator className={menuSeparatorClass} />
          <ContextMenu.Item
            className={
              menuItemClass +
              " text-red-500 hover:text-red-500 focus:text-red-500"
            }
            onSelect={() => onDeleteFolder(folder.path)}
          >
            <TrashIcon className="w-4 h-4 stroke-[1.6]" />
            Delete Folder
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
});

export function FolderTreeView() {
  const {
    notes,
    selectedFolderPath,
    selectFolder,
    createNoteInFolder,
    createFolder,
    deleteFolder,
    renameFolder,
    moveFolder,
  } = useNotes();

  const [collapsedFolders, setCollapsedFolders] =
    useState<Set<string>>(loadCollapsedFolders);
  const [knownFolders, setKnownFolders] = useState<string[]>([]);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderDialogParent, setFolderDialogParent] = useState("");
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [folderToRename, setFolderToRename] = useState<string | null>(null);
  const [renameDefaultValue, setRenameDefaultValue] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState<string | null>(null);

  useEffect(() => {
    notesService
      .listFolders()
      .then(setKnownFolders)
      .catch(() => setKnownFolders([]));
  }, [notes]);

  useEffect(() => {
    saveCollapsedFolders(collapsedFolders);
  }, [collapsedFolders]);

  const tree = useMemo(
    () => buildFolderTree(notes, new Set<string>(), knownFolders),
    [knownFolders, notes],
  );

  const expandFolder = useCallback((folderPath: string) => {
    if (!folderPath) return;

    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      const parts = folderPath.split("/");
      for (let index = 1; index <= parts.length; index += 1) {
        next.delete(parts.slice(0, index).join("/"));
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const handleExpand = (event: Event) => {
      const folderPath = (event as CustomEvent<string>).detail;
      if (folderPath) {
        expandFolder(folderPath);
      }
    };

    window.addEventListener("expand-folder", handleExpand);
    return () => window.removeEventListener("expand-folder", handleExpand);
  }, [expandFolder]);

  useEffect(() => {
    const handleCreateFolder = () => {
      setFolderDialogParent(selectedFolderPath ?? "");
      setFolderDialogOpen(true);
    };

    window.addEventListener("create-new-folder", handleCreateFolder);
    return () =>
      window.removeEventListener("create-new-folder", handleCreateFolder);
  }, [selectedFolderPath]);

  useEffect(() => {
    if (selectedFolderPath) {
      expandFolder(selectedFolderPath);
    }
  }, [expandFolder, selectedFolderPath]);

  const handleToggleCollapse = useCallback((path: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const handleCreateFolder = useCallback(async (name: string) => {
    try {
      await createFolder(folderDialogParent, name);
      if (folderDialogParent) {
        expandFolder(folderDialogParent);
      }
      setFolderDialogOpen(false);
    } catch (error) {
      console.error("Failed to create folder:", error);
      toast.error("Failed to create folder");
    }
  }, [createFolder, expandFolder, folderDialogParent]);

  const handleRenameFolder = useCallback((path: string, currentName: string) => {
    setFolderToRename(path);
    setRenameDefaultValue(currentName);
    setRenameDialogOpen(true);
  }, []);

  const handleRenameConfirm = useCallback(async (newName: string) => {
    if (!folderToRename) return;

    try {
      await renameFolder(folderToRename, newName);
      setFolderToRename(null);
      setRenameDialogOpen(false);
    } catch (error) {
      console.error("Failed to rename folder:", error);
      toast.error("Failed to rename folder");
    }
  }, [folderToRename, renameFolder]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!folderToDelete) return;

    try {
      await deleteFolder(folderToDelete);
      setFolderToDelete(null);
      setDeleteDialogOpen(false);
    } catch (error) {
      console.error("Failed to delete folder:", error);
      toast.error("Failed to delete folder");
    }
  }, [deleteFolder, folderToDelete]);

  const { setNodeRef: setRootDropRef, isOver: isOverRoot } = useDroppable({
    id: "drop-folder:root",
    data: { type: "folder", path: "" },
  });

  return (
    <>
      <div data-folder-tree className="flex flex-col gap-1 px-1.5 pb-1.5">
        <div
          ref={setRootDropRef}
          className={`rounded-md transition-[background-color,box-shadow] duration-200 ${
            isOverRoot
              ? "bg-accent/12 ring-1 ring-accent/60"
              : selectedFolderPath === null
                ? "bg-bg-muted"
                : "hover:bg-bg-muted/80"
          }`}
        >
          <button
            type="button"
            onClick={() => selectFolder(null)}
            className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left"
          >
            <span className="flex items-center gap-2 min-w-0">
              <FolderIcon className="w-4.25 h-4.25 stroke-[1.6] text-text-muted/80 shrink-0" />
              <span className="text-sm font-medium text-text truncate">
                All Notes
              </span>
            </span>
            <span className="text-2xs font-medium text-text-muted/70 shrink-0 px-1.5 py-0.5 rounded-full bg-bg/70">
              {notes.length}
            </span>
          </button>
        </div>

        <div className="flex flex-col gap-0.5">
          {tree.folders.map((folder) => (
            <FolderItem
              key={folder.path}
              folder={folder}
              depth={0}
              selectedFolderPath={selectedFolderPath}
              collapsedFolders={collapsedFolders}
              onToggleCollapse={handleToggleCollapse}
              onSelectFolder={selectFolder}
              onCreateNoteHere={createNoteInFolder}
              onNewSubfolder={(parentPath) => {
                setFolderDialogParent(parentPath);
                setFolderDialogOpen(true);
              }}
              onRenameFolder={handleRenameFolder}
              onDeleteFolder={(path) => {
                setFolderToDelete(path);
                setDeleteDialogOpen(true);
              }}
              onMoveFolderToParent={(path, targetParent) => {
                void moveFolder(path, targetParent).catch((error) => {
                  console.error("Failed to move folder:", error);
                  toast.error("Failed to move folder");
                });
              }}
            />
          ))}
        </div>
      </div>

      <FolderNameDialog
        open={folderDialogOpen}
        onOpenChange={setFolderDialogOpen}
        onConfirm={handleCreateFolder}
        title={folderDialogParent ? "Create new subfolder" : "Create new folder"}
        description={
          folderDialogParent
            ? "Enter a name for your new subfolder"
            : "Enter a name for your new folder"
        }
        confirmLabel="Create"
      />

      <FolderNameDialog
        open={renameDialogOpen}
        onOpenChange={setRenameDialogOpen}
        onConfirm={handleRenameConfirm}
        title="Rename Folder"
        description="Enter a new name for the folder"
        confirmLabel="Rename"
        defaultValue={renameDefaultValue}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete folder?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the folder and all notes inside it.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleDeleteConfirm();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

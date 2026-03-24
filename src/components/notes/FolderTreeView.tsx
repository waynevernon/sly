import {
  Suspense,
  lazy,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { toast } from "sonner";
import { useNotes } from "../../context/NotesContext";
import { buildFolderTree, countNotesInFolder } from "../../lib/folderTree";
import type { FolderNode } from "../../types/note";
import * as notesService from "../../services/notes";
import { getFolderIconName } from "../../lib/folderIcons";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  InlineNameEditor,
} from "../ui";
import {
  AddNoteIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FolderPlusIcon,
  PencilIcon,
  SwatchIcon,
  TrashIcon,
} from "../icons";
import { FolderGlyph } from "../folders/FolderGlyph";

const STORAGE_KEY = "scratch:collapsedFolders";
const FolderIconPickerModal = lazy(() =>
  import("../folders/FolderIconPickerModal").then((module) => ({
    default: module.FolderIconPickerModal,
  })),
);

const menuItemClass =
  "px-3 py-1.5 text-sm text-text cursor-pointer outline-none hover:bg-bg-muted focus:bg-bg-muted flex items-center gap-2 rounded-sm";

const menuSeparatorClass = "h-px bg-border my-1";

type InlineFolderEditState =
  | { mode: "create"; parentPath: string; iconName: string | null }
  | {
      mode: "rename";
      path: string;
      initialValue: string;
      iconName: string | null;
    };

type FolderIconPickerTarget =
  | { kind: "existing"; path: string }
  | { kind: "inline-create" }
  | { kind: "inline-rename"; path: string };

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

function sanitizeFolderName(name: string): string {
  return name.replace(/[\/\\:*?"<>|]/g, "-").trim();
}

function getFolderLeaf(path: string): string {
  return path.split("/").pop() || path;
}

function getRenamedFolderPath(path: string, newName: string): string {
  const sanitizedName = sanitizeFolderName(newName);
  const lastSlash = path.lastIndexOf("/");
  return lastSlash >= 0
    ? `${path.substring(0, lastSlash)}/${sanitizedName}`
    : sanitizedName;
}

interface InlineFolderRowProps {
  depth: number;
  initialValue?: string;
  iconName?: string | null;
  placeholder: string;
  noteCount?: number;
  isSelected?: boolean;
  collapseState?: "expanded" | "collapsed";
  onSubmit: (name: string) => Promise<void> | void;
  onCancel: () => void;
  onOpenIconPicker: () => void;
}

function InlineFolderRow({
  depth,
  initialValue = "",
  iconName = null,
  placeholder,
  noteCount,
  isSelected = false,
  collapseState,
  onSubmit,
  onCancel,
  onOpenIconPicker,
}: InlineFolderRowProps) {
  const CollapseIcon =
    collapseState === "collapsed"
      ? ChevronRightIcon
      : collapseState === "expanded"
        ? ChevronDownIcon
        : null;

  return (
    <div
      className={`rounded-md ${
        isSelected ? "bg-bg-muted ring-1 ring-text-muted/20" : "bg-bg-muted/70"
      }`}
      style={{ marginLeft: `${depth * 12}px` }}
    >
      <div className="flex items-center gap-1.5 pr-2 py-1.5">
        <span className="ml-2 h-5 w-5 flex items-center justify-center shrink-0 text-text-muted/70">
          {CollapseIcon ? <CollapseIcon className="w-4 h-4 stroke-[1.6]" /> : null}
        </span>
        <div className="min-w-0 flex-1 flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenIconPicker}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-muted/80 transition-colors hover:bg-bg hover:text-text"
            aria-label="Choose folder icon"
          >
            <FolderGlyph
              iconName={iconName}
              className="w-4.25 h-4.25 text-current shrink-0"
              strokeWidth={1.7}
            />
          </button>
          <InlineNameEditor
            initialValue={initialValue}
            placeholder={placeholder}
            onSubmit={onSubmit}
            onCancel={onCancel}
            className="h-7 flex-1 border-border/80 bg-bg px-2.5 py-1.5 text-sm font-medium"
          />
        </div>
        {typeof noteCount === "number" && (
          <span className="text-2xs font-medium text-text-muted/70 shrink-0 px-1.5 py-0.5 rounded-full bg-bg/70">
            {noteCount}
          </span>
        )}
      </div>
    </div>
  );
}

interface FolderItemProps {
  folder: FolderNode;
  depth: number;
  folderIcons: Record<string, string>;
  selectedFolderPath: string | null;
  collapsedFolders: Set<string>;
  inlineEditState: InlineFolderEditState | null;
  onToggleCollapse: (path: string) => void;
  onSelectFolder: (path: string) => void;
  onCreateNoteHere: (path: string) => void;
  onStartCreateFolder: (parentPath: string) => void;
  onCreateFolder: (name: string) => Promise<void>;
  onStartRenameFolder: (path: string, currentName: string) => void;
  onRenameFolder: (name: string) => Promise<void>;
  onCancelInlineEdit: () => void;
  onDeleteFolder: (path: string) => void;
  onMoveFolderToParent: (path: string, targetParent: string) => void;
  onOpenIconPicker: (target: FolderIconPickerTarget) => void;
}

const FolderItem = memo(function FolderItem({
  folder,
  depth,
  folderIcons,
  selectedFolderPath,
  collapsedFolders,
  inlineEditState,
  onToggleCollapse,
  onSelectFolder,
  onCreateNoteHere,
  onStartCreateFolder,
  onCreateFolder,
  onStartRenameFolder,
  onRenameFolder,
  onCancelInlineEdit,
  onDeleteFolder,
  onMoveFolderToParent,
  onOpenIconPicker,
}: FolderItemProps) {
  const isCollapsed = collapsedFolders.has(folder.path);
  const noteCount = countNotesInFolder(folder);
  const iconName = getFolderIconName(folderIcons, folder.path);
  const isRenaming =
    inlineEditState?.mode === "rename" && inlineEditState.path === folder.path;
  const isCreatingChild =
    inlineEditState?.mode === "create" &&
    inlineEditState.parentPath === folder.path;

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

  if (isRenaming) {
    return (
      <div>
        <InlineFolderRow
          depth={depth}
          initialValue={inlineEditState.initialValue}
          iconName={inlineEditState.iconName}
          placeholder="Folder name"
          noteCount={noteCount}
          isSelected={selectedFolderPath === folder.path}
          collapseState={isCollapsed ? "collapsed" : "expanded"}
          onSubmit={onRenameFolder}
          onCancel={onCancelInlineEdit}
          onOpenIconPicker={() =>
            onOpenIconPicker({ kind: "inline-rename", path: folder.path })
          }
        />

        {!isCollapsed && folder.children.length > 0 && (
          <div className="flex flex-col gap-0.5 pt-0.5">
            {folder.children.map((child) => (
              <FolderItem
                key={child.path}
                folder={child}
                depth={depth + 1}
                folderIcons={folderIcons}
                selectedFolderPath={selectedFolderPath}
                collapsedFolders={collapsedFolders}
                inlineEditState={inlineEditState}
                onToggleCollapse={onToggleCollapse}
                onSelectFolder={onSelectFolder}
                onCreateNoteHere={onCreateNoteHere}
                onStartCreateFolder={onStartCreateFolder}
                onCreateFolder={onCreateFolder}
                onStartRenameFolder={onStartRenameFolder}
                onRenameFolder={onRenameFolder}
                onCancelInlineEdit={onCancelInlineEdit}
                onDeleteFolder={onDeleteFolder}
                onMoveFolderToParent={onMoveFolderToParent}
                onOpenIconPicker={onOpenIconPicker}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

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
                <FolderGlyph
                  iconName={iconName}
                  className="w-4.25 h-4.25 text-text-muted/80 shrink-0"
                  strokeWidth={1.7}
                />
                <span className="text-sm text-text truncate">{folder.name}</span>
              </button>
              <span className="text-2xs font-medium text-text-muted/70 shrink-0 px-1.5 py-0.5 rounded-full bg-bg/70">
                {noteCount}
              </span>
            </div>
          </div>

          {!isCollapsed && (isCreatingChild || folder.children.length > 0) && (
            <div className="flex flex-col gap-0.5 pt-0.5">
              {isCreatingChild && (
                <InlineFolderRow
                  depth={depth + 1}
                  iconName={inlineEditState.iconName}
                  placeholder="Folder name"
                  onSubmit={onCreateFolder}
                  onCancel={onCancelInlineEdit}
                  onOpenIconPicker={() =>
                    onOpenIconPicker({ kind: "inline-create" })
                  }
                />
              )}

              {folder.children.map((child) => (
                <FolderItem
                  key={child.path}
                  folder={child}
                  depth={depth + 1}
                  folderIcons={folderIcons}
                  selectedFolderPath={selectedFolderPath}
                  collapsedFolders={collapsedFolders}
                  inlineEditState={inlineEditState}
                  onToggleCollapse={onToggleCollapse}
                  onSelectFolder={onSelectFolder}
                  onCreateNoteHere={onCreateNoteHere}
                  onStartCreateFolder={onStartCreateFolder}
                  onCreateFolder={onCreateFolder}
                  onStartRenameFolder={onStartRenameFolder}
                  onRenameFolder={onRenameFolder}
                  onCancelInlineEdit={onCancelInlineEdit}
                  onDeleteFolder={onDeleteFolder}
                  onMoveFolderToParent={onMoveFolderToParent}
                  onOpenIconPicker={onOpenIconPicker}
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
            onSelect={() => onStartCreateFolder(folder.path)}
          >
            <FolderPlusIcon className="w-4 h-4 stroke-[1.6]" />
            New Subfolder
          </ContextMenu.Item>
          <ContextMenu.Separator className={menuSeparatorClass} />
          <ContextMenu.Item
            className={menuItemClass}
            onSelect={() => onStartRenameFolder(folder.path, getFolderLeaf(folder.path))}
          >
            <PencilIcon className="w-4 h-4 stroke-[1.6]" />
            Rename
          </ContextMenu.Item>
          <ContextMenu.Item
            className={menuItemClass}
            onSelect={() => onOpenIconPicker({ kind: "existing", path: folder.path })}
          >
            <SwatchIcon className="w-4 h-4 stroke-[1.6]" />
            Change Icon
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
    folderIcons,
    selectedFolderPath,
    selectFolder,
    createNoteInFolder,
    createFolder,
    deleteFolder,
    renameFolder,
    moveFolder,
    setFolderIcon,
  } = useNotes();

  const [collapsedFolders, setCollapsedFolders] =
    useState<Set<string>>(loadCollapsedFolders);
  const [knownFolders, setKnownFolders] = useState<string[]>([]);
  const [inlineEditState, setInlineEditState] =
    useState<InlineFolderEditState | null>(null);
  const [iconPickerTarget, setIconPickerTarget] =
    useState<FolderIconPickerTarget | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState<string | null>(null);
  const treeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const preloadPicker = () => {
      void import("../folders/FolderIconPickerModal");
    };

    if ("requestIdleCallback" in window) {
      const idleId = window.requestIdleCallback(preloadPicker);
      return () => window.cancelIdleCallback(idleId);
    }

    const timeoutId = globalThis.setTimeout(preloadPicker, 300);
    return () => globalThis.clearTimeout(timeoutId);
  }, []);

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

  const focusTree = useCallback(() => {
    requestAnimationFrame(() => {
      treeRef.current?.focus();
    });
  }, []);

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

  const startCreateFolder = useCallback((parentPath: string) => {
    if (parentPath) {
      expandFolder(parentPath);
    }
    setInlineEditState({ mode: "create", parentPath, iconName: null });
  }, [expandFolder]);

  const startRenameFolder = useCallback((path: string, currentName: string) => {
    setInlineEditState({
      mode: "rename",
      path,
      initialValue: currentName,
      iconName: getFolderIconName(folderIcons, path),
    });
  }, [folderIcons]);

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
      startCreateFolder(selectedFolderPath ?? "");
    };

    window.addEventListener("create-new-folder", handleCreateFolder);
    return () =>
      window.removeEventListener("create-new-folder", handleCreateFolder);
  }, [selectedFolderPath, startCreateFolder]);

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

  const handleCancelInlineEdit = useCallback(() => {
    setInlineEditState(null);
    setIconPickerTarget(null);
    focusTree();
  }, [focusTree]);

  const handleCreateFolder = useCallback(async (name: string) => {
    if (inlineEditState?.mode !== "create") return;

    const parentPath = inlineEditState.parentPath;
    const iconName = inlineEditState.iconName;
    const folderName = sanitizeFolderName(name);

    if (!folderName) {
      handleCancelInlineEdit();
      return;
    }

    try {
      await createFolder(parentPath, folderName);
      const newPath = parentPath ? `${parentPath}/${folderName}` : folderName;
      if (iconName) {
        try {
          await setFolderIcon(newPath, iconName);
        } catch (error) {
          console.error("Failed to save new folder icon:", error);
          toast.error("Folder created, but failed to save icon");
        }
      }
      expandFolder(newPath);
      selectFolder(newPath);
      setInlineEditState(null);
      setIconPickerTarget(null);
      focusTree();
    } catch (error) {
      console.error("Failed to create folder:", error);
      toast.error("Failed to create folder");
      throw error;
    }
  }, [
    createFolder,
    expandFolder,
    focusTree,
    handleCancelInlineEdit,
    inlineEditState,
    setFolderIcon,
    selectFolder,
  ]);

  const handleRenameFolder = useCallback(async (newName: string) => {
    if (inlineEditState?.mode !== "rename") return;

    const oldPath = inlineEditState.path;
    const iconName = inlineEditState.iconName;
    const previousIconName = getFolderIconName(folderIcons, oldPath);
    const sanitizedName = sanitizeFolderName(newName);
    const currentName = getFolderLeaf(oldPath);
    const iconChanged = iconName !== previousIconName;

    if (!sanitizedName) {
      handleCancelInlineEdit();
      return;
    }

    try {
      const newPath = getRenamedFolderPath(oldPath, sanitizedName);
      if (sanitizedName === currentName) {
        if (!iconChanged) {
          handleCancelInlineEdit();
          return;
        }

        await setFolderIcon(oldPath, iconName);
        selectFolder(oldPath);
        setInlineEditState(null);
        setIconPickerTarget(null);
        focusTree();
        return;
      }

      await renameFolder(oldPath, sanitizedName);
      if (iconChanged) {
        try {
          await setFolderIcon(newPath, iconName);
        } catch (error) {
          console.error("Failed to save renamed folder icon:", error);
          toast.error("Folder renamed, but failed to save icon");
        }
      }
      expandFolder(newPath);
      selectFolder(newPath);
      setInlineEditState(null);
      setIconPickerTarget(null);
      focusTree();
    } catch (error) {
      console.error("Failed to rename folder:", error);
      toast.error("Failed to rename folder");
      throw error;
    }
  }, [
    expandFolder,
    focusTree,
    handleCancelInlineEdit,
    folderIcons,
    inlineEditState,
    renameFolder,
    setFolderIcon,
    selectFolder,
  ]);

  const pickerValue = useMemo(() => {
    if (!iconPickerTarget) return null;

    if (iconPickerTarget.kind === "existing") {
      return getFolderIconName(folderIcons, iconPickerTarget.path);
    }

    if (iconPickerTarget.kind === "inline-create") {
      return inlineEditState?.mode === "create" ? inlineEditState.iconName : null;
    }

    return inlineEditState?.mode === "rename" &&
      inlineEditState.path === iconPickerTarget.path
      ? inlineEditState.iconName
      : null;
  }, [folderIcons, iconPickerTarget, inlineEditState]);

  const pickerTitle = useMemo(() => {
    if (!iconPickerTarget) return "Choose Folder Icon";
    if (iconPickerTarget.kind === "existing") {
      return `Choose Icon for ${getFolderLeaf(iconPickerTarget.path)}`;
    }
    if (iconPickerTarget.kind === "inline-create") {
      return "Choose Icon for New Folder";
    }
    return `Choose Icon for ${getFolderLeaf(iconPickerTarget.path)}`;
  }, [iconPickerTarget]);

  const handleIconPickerSelect = useCallback(async (iconName: string | null) => {
    if (!iconPickerTarget) return;

    if (iconPickerTarget.kind === "existing") {
      try {
        await setFolderIcon(iconPickerTarget.path, iconName);
      } catch (error) {
        console.error("Failed to update folder icon:", error);
        toast.error("Failed to update folder icon");
        return;
      }

      setIconPickerTarget(null);
      focusTree();
      return;
    }

    setInlineEditState((current) => {
      if (!current) return current;

      if (iconPickerTarget.kind === "inline-create" && current.mode === "create") {
        return { ...current, iconName };
      }

      if (
        iconPickerTarget.kind === "inline-rename" &&
        current.mode === "rename" &&
        current.path === iconPickerTarget.path
      ) {
        return { ...current, iconName };
      }

      return current;
    });

    setIconPickerTarget(null);
  }, [focusTree, iconPickerTarget, setFolderIcon]);

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

  const isCreatingRoot =
    inlineEditState?.mode === "create" && inlineEditState.parentPath === "";

  return (
    <>
      <div
        ref={treeRef}
        tabIndex={0}
        data-folder-tree
        className="flex flex-col gap-1 px-1.5 pb-1.5 outline-none"
      >
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
              <FolderGlyph
                className="w-4.25 h-4.25 text-text-muted/80 shrink-0"
                strokeWidth={1.7}
              />
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
          {isCreatingRoot && (
            <InlineFolderRow
              depth={0}
              iconName={inlineEditState?.mode === "create" ? inlineEditState.iconName : null}
              placeholder="Folder name"
              onSubmit={handleCreateFolder}
              onCancel={handleCancelInlineEdit}
              onOpenIconPicker={() => setIconPickerTarget({ kind: "inline-create" })}
            />
          )}

          {tree.folders.map((folder) => (
            <FolderItem
              key={folder.path}
              folder={folder}
              depth={0}
              folderIcons={folderIcons}
              selectedFolderPath={selectedFolderPath}
              collapsedFolders={collapsedFolders}
              inlineEditState={inlineEditState}
              onToggleCollapse={handleToggleCollapse}
              onSelectFolder={selectFolder}
              onCreateNoteHere={createNoteInFolder}
              onStartCreateFolder={startCreateFolder}
              onCreateFolder={handleCreateFolder}
              onStartRenameFolder={startRenameFolder}
              onRenameFolder={handleRenameFolder}
              onOpenIconPicker={setIconPickerTarget}
              onCancelInlineEdit={handleCancelInlineEdit}
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

      <Suspense fallback={null}>
        <FolderIconPickerModal
          open={iconPickerTarget !== null}
          value={pickerValue}
          title={pickerTitle}
          onOpenChange={(open) => {
            if (!open) {
              const shouldRefocusTree = iconPickerTarget?.kind === "existing";
              setIconPickerTarget(null);
              if (shouldRefocusTree) {
                focusTree();
              }
            }
          }}
          onSelect={(iconName) => {
            void handleIconPickerSelect(iconName);
          }}
        />
      </Suspense>

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

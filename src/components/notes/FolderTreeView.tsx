import {
  Suspense,
  lazy,
  memo,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { useDndContext, useDraggable, useDroppable } from "@dnd-kit/core";
import { FilePlusCorner, History } from "lucide-react";
import { toast } from "sonner";
import { useNotes } from "../../context/NotesContext";
import { useTheme } from "../../context/ThemeContext";
import { buildFolderTree, countNotesInFolder } from "../../lib/folderTree";
import type {
  FolderAppearance,
  FolderNode,
} from "../../types/note";
import {
  areFolderAppearancesEqual,
  getFolderAppearance,
  resolveFolderAppearanceIconColor,
  resolveFolderAppearanceTextColor,
  type FolderAppearanceMap,
} from "../../lib/folderIcons";
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
  CountBadge,
  InlineNameEditor,
  destructiveMenuItemClassName,
  menuItemClassName,
  menuSeparatorClassName,
  menuSurfaceClassName,
} from "../ui";
import {
  ArrowUpIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FolderPlusIcon,
  PencilIcon,
  PinIcon,
  SwatchIcon,
  TrashIcon,
} from "../icons";
import { FolderGlyph } from "../folders/FolderGlyph";

const FolderIconPickerModal = lazy(() =>
  import("../folders/FolderIconPickerModal").then((module) => ({
    default: module.FolderIconPickerModal,
  })),
);

type InlineFolderEditState =
  | { mode: "create"; parentPath: string; appearance: FolderAppearance | null }
  | {
      mode: "rename";
      path: string;
      initialValue: string;
      appearance: FolderAppearance | null;
      wasCollapsed: boolean;
    };

type FolderIconPickerTarget =
  | { kind: "existing"; path: string }
  | { kind: "inline-create" }
  | { kind: "inline-rename"; path: string };

const TREE_INDENT_WIDTH = 12;

function sanitizeFolderName(name: string): string {
  return name.replace(/[\/\\:*?"<>|]/g, "-").trim();
}

function getFolderLeaf(path: string): string {
  return path.split("/").pop() || path;
}

function getNotesRootLabel(notesFolder: string | null): string {
  if (!notesFolder) return "Notes";
  const parts = notesFolder.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || "Notes";
}

function getFolderOptionId(path: string): string {
  return `folder-option-${encodeURIComponent(path)}`;
}

function getVirtualFolderOptionId(kind: "pinned" | "recent" | "all"): string {
  return `folder-option-${kind}`;
}

function getFolderParentPath(path: string): string {
  const lastSlash = path.lastIndexOf("/");
  return lastSlash >= 0 ? path.substring(0, lastSlash) : "";
}

function getRenamedFolderPath(path: string, newName: string): string {
  const sanitizedName = sanitizeFolderName(newName);
  const lastSlash = path.lastIndexOf("/");
  return lastSlash >= 0
    ? `${path.substring(0, lastSlash)}/${sanitizedName}`
    : sanitizedName;
}

function getFolderTextStyle(
  folderAppearance: FolderAppearance | null | undefined,
  resolvedTheme: "light" | "dark",
): CSSProperties | undefined {
  const color = resolveFolderAppearanceTextColor(folderAppearance, resolvedTheme);
  return color ? { color } : undefined;
}

function getFolderIconStyle(
  folderAppearance: FolderAppearance | null | undefined,
  resolvedTheme: "light" | "dark",
): CSSProperties | undefined {
  const color = resolveFolderAppearanceIconColor(folderAppearance, resolvedTheme);
  return color ? { color } : undefined;
}

function FolderRowTrailing({
  count,
  isActive = false,
  children,
}: {
  count: number;
  isActive?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="ml-auto flex items-center gap-1.5 pl-2 shrink-0">
      {children}
      <div className="ui-count-badge-column">
        <CountBadge
          count={count}
          layout="column"
          emphasis={isActive ? "active" : "inactive"}
        />
      </div>
    </div>
  );
}

interface InlineFolderRowProps {
  depth: number;
  initialValue?: string;
  appearance?: FolderAppearance | null;
  placeholder: string;
  noteCount?: number;
  showNoteCounts?: boolean;
  isSelected?: boolean;
  collapseState?: "expanded" | "collapsed";
  resolvedTheme: "light" | "dark";
  onSubmit: (name: string) => Promise<void> | void;
  onCancel: () => void;
  onOpenIconPicker: () => void;
}

function InlineFolderRow({
  depth,
  initialValue = "",
  appearance = null,
  placeholder,
  noteCount,
  showNoteCounts = true,
  isSelected = false,
  collapseState,
  resolvedTheme,
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
  const isOpen = collapseState === "expanded";
  const showCollapseToggle = CollapseIcon !== null;
  const textStyle = getFolderTextStyle(appearance, resolvedTheme);
  const iconStyle = getFolderIconStyle(appearance, resolvedTheme);

  return (
    <div
      className={`rounded-[var(--ui-radius-md)] ${
        isSelected ? "bg-bg-muted ring-1 ring-text-muted/20" : "bg-bg-muted/70"
      }`}
    >
      <div className="flex items-center gap-1.5 pr-2 py-2" style={{ paddingLeft: `${depth * 12}px` }}>
        <div className="min-w-0 flex flex-1 items-center gap-2">
          <span className="ml-2 h-5 w-5 flex items-center justify-center shrink-0 text-text-muted/70">
            {showCollapseToggle ? (
              <CollapseIcon className="w-4 h-4 stroke-[1.6]" />
            ) : null}
          </span>
          <button
            type="button"
            onClick={onOpenIconPicker}
            className="flex h-6 w-6 -my-0.5 shrink-0 items-center justify-center rounded-[var(--ui-radius-md)] text-text-muted/80 transition-colors hover:bg-bg hover:text-text"
            aria-label="Customize folder style"
            style={iconStyle}
          >
            <FolderGlyph
              icon={appearance?.icon ?? null}
              open={isOpen}
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
            style={textStyle}
          />
        </div>
        {showNoteCounts && typeof noteCount === "number" && noteCount > 0 && (
          <FolderRowTrailing count={noteCount} isActive={isSelected} />
        )}
      </div>
    </div>
  );
}

interface FolderItemProps {
  folder: FolderNode;
  depth: number;
  pendingFolderPath: string | null;
  folderAppearances: FolderAppearanceMap;
  showNoteCounts: boolean;
  noteCount: number;
  getNoteCount: (folder: FolderNode) => number;
  selectedFolderPath: string | null;
  collapsedFolders: Set<string>;
  inlineEditState: InlineFolderEditState | null;
  resolvedTheme: "light" | "dark";
  onToggleCollapse: (path: string) => void;
  onSelectFolder: (path: string) => void;
  onContextSelectFolder: (path: string) => void;
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
  pendingFolderPath,
  folderAppearances,
  showNoteCounts,
  noteCount,
  getNoteCount,
  selectedFolderPath,
  collapsedFolders,
  inlineEditState,
  resolvedTheme,
  onToggleCollapse,
  onSelectFolder,
  onContextSelectFolder,
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
  const suppressCloseAutoFocusRef = useRef(false);
  const isCollapsed = collapsedFolders.has(folder.path);
  const folderAppearance = getFolderAppearance(folderAppearances, folder.path);
  const folderTextStyle = getFolderTextStyle(folderAppearance, resolvedTheme);
  const folderIconStyle = getFolderIconStyle(folderAppearance, resolvedTheme);
  const isPendingMove = pendingFolderPath === folder.path;
  const isRenaming =
    inlineEditState?.mode === "rename" && inlineEditState.path === folder.path;
  const isCreatingChild =
    inlineEditState?.mode === "create" &&
    inlineEditState.parentPath === folder.path;
  const { active } = useDndContext();
  const activeDragType = active?.data.current?.type;
  const isContainerDropActive =
    activeDragType === "note" || activeDragType === "folder";

  const {
    attributes: dragAttributes,
    listeners: dragListeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: `folder:${folder.path}`,
    data: {
      type: "folder",
      path: folder.path,
    },
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `drop-folder:${folder.path}`,
    data: {
      type: "folder-drop-target",
      path: folder.path,
    },
  });

  const rowClassName = `rounded-[var(--ui-radius-md)] transition-[background-color,box-shadow,opacity] duration-200 ${
    isOver && isContainerDropActive
      ? "bg-accent/12 ring-1 ring-accent/60"
      : selectedFolderPath === folder.path
        ? "bg-bg-muted"
        : "hover:bg-bg-muted/80"
  }`;
  const hasNestedFolders = folder.children.length > 0 || isCreatingChild;

  const shouldHideChildrenForRename =
    inlineEditState?.mode === "rename" &&
    inlineEditState.path === folder.path &&
    inlineEditState.wasCollapsed;
  const children = !isCollapsed &&
    !shouldHideChildrenForRename &&
    (isCreatingChild || folder.children.length > 0) && (
    <div className="flex flex-col gap-1 pt-0.5">
      {isCreatingChild && (
        <InlineFolderRow
          depth={depth + 1}
          appearance={inlineEditState?.mode === "create" ? inlineEditState.appearance : null}
          placeholder="Folder name"
          showNoteCounts={showNoteCounts}
          resolvedTheme={resolvedTheme}
          onSubmit={onCreateFolder}
          onCancel={onCancelInlineEdit}
          onOpenIconPicker={() => onOpenIconPicker({ kind: "inline-create" })}
        />
      )}

      {folder.children.map((child) => (
        <FolderItem
          key={child.path}
          folder={child}
          depth={depth + 1}
          pendingFolderPath={pendingFolderPath}
          folderAppearances={folderAppearances}
          showNoteCounts={showNoteCounts}
          noteCount={getNoteCount(child)}
          getNoteCount={getNoteCount}
          selectedFolderPath={selectedFolderPath}
          collapsedFolders={collapsedFolders}
          inlineEditState={inlineEditState}
          resolvedTheme={resolvedTheme}
          onToggleCollapse={onToggleCollapse}
          onSelectFolder={onSelectFolder}
          onContextSelectFolder={onContextSelectFolder}
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
  );

  const content = isRenaming ? (
    <>
      <InlineFolderRow
        depth={depth}
        initialValue={inlineEditState?.mode === "rename" ? inlineEditState.initialValue : ""}
        appearance={inlineEditState?.mode === "rename" ? inlineEditState.appearance : null}
        placeholder="Folder name"
        noteCount={noteCount}
        showNoteCounts={showNoteCounts}
        isSelected={selectedFolderPath === folder.path}
        collapseState={
          hasNestedFolders ? (isCollapsed ? "collapsed" : "expanded") : undefined
        }
        resolvedTheme={resolvedTheme}
        onSubmit={onRenameFolder}
        onCancel={onCancelInlineEdit}
        onOpenIconPicker={() =>
          onOpenIconPicker({ kind: "inline-rename", path: folder.path })
        }
      />
      {children}
    </>
  ) : (
    <>
      <div className={`relative ${isDragging || isPendingMove ? "opacity-40" : ""}`}>
        <div
          ref={setDropRef}
          id={getFolderOptionId(folder.path)}
          role="option"
          aria-selected={selectedFolderPath === folder.path}
          className={`${rowClassName} cursor-default`}
          data-folder-row-select={folder.path}
          onClick={() => onSelectFolder(folder.path)}
          onContextMenu={() => onContextSelectFolder(folder.path)}
        >
          <div
            className="flex items-center gap-1.5 pr-2 py-2"
            style={{ paddingLeft: `${depth * TREE_INDENT_WIDTH}px` }}
          >
            {hasNestedFolders ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleCollapse(folder.path);
                }}
                className="ml-2 h-5 w-5 rounded-[var(--ui-radius-sm)] text-text-muted/70 hover:bg-bg-muted/80 flex items-center justify-center shrink-0"
                aria-label={isCollapsed ? "Expand folder" : "Collapse folder"}
              >
                {isCollapsed ? (
                  <ChevronRightIcon className="w-4 h-4 stroke-[1.6]" />
                ) : (
                  <ChevronDownIcon className="w-4 h-4 stroke-[1.6]" />
                )}
              </button>
            ) : (
              <span className="ml-2 h-5 w-5 shrink-0" aria-hidden="true" />
            )}
            <button
              type="button"
              ref={setDragRef}
              {...dragAttributes}
              {...dragListeners}
              onClick={(event) => {
                event.stopPropagation();
              }}
              className="flex h-6 w-6 -my-0.5 shrink-0 items-center justify-center rounded-[var(--ui-radius-md)] text-text-muted/80 transition-colors hover:bg-bg hover:text-text cursor-grab active:cursor-grabbing"
              aria-label={`Move ${folder.name}`}
              style={folderIconStyle}
            >
              <FolderGlyph
                icon={folderAppearance?.icon ?? null}
                open={hasNestedFolders && !isCollapsed}
                className="w-4.25 h-4.25 text-current shrink-0"
                strokeWidth={1.7}
              />
            </button>
            <div className="min-w-0 flex flex-1 items-center gap-1.5 text-left">
              <span
                className="min-w-0 flex-1 text-sm text-text truncate block"
                style={folderTextStyle}
              >
                {folder.name}
              </span>
              {showNoteCounts && noteCount > 0 && (
                <FolderRowTrailing
                  count={noteCount}
                  isActive={selectedFolderPath === folder.path}
                />
              )}
            </div>
          </div>
        </div>
      </div>
      {children}
    </>
  );

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div data-folder-path={folder.path}>
          {content}
        </div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          className={`${menuSurfaceClassName} min-w-44 z-50`}
          onCloseAutoFocus={(event) => {
            if (!suppressCloseAutoFocusRef.current) return;
            suppressCloseAutoFocusRef.current = false;
            event.preventDefault();
          }}
        >
          <ContextMenu.Item
            className={menuItemClassName}
            onSelect={() => onCreateNoteHere(folder.path)}
          >
            <FilePlusCorner className="w-4 h-4 stroke-[1.6]" />
            New Note
          </ContextMenu.Item>
          <ContextMenu.Item
            className={menuItemClassName}
            onSelect={() => {
              suppressCloseAutoFocusRef.current = true;
              onStartCreateFolder(folder.path);
            }}
          >
            <FolderPlusIcon className="w-4 h-4 stroke-[1.6]" />
            New Subfolder
          </ContextMenu.Item>
          <ContextMenu.Separator className={menuSeparatorClassName} />
          <ContextMenu.Item
            className={menuItemClassName}
            onSelect={() => {
              suppressCloseAutoFocusRef.current = true;
              onStartRenameFolder(folder.path, getFolderLeaf(folder.path));
            }}
          >
            <PencilIcon className="w-4 h-4 stroke-[1.6]" />
            Rename
          </ContextMenu.Item>
          <ContextMenu.Item
            className={menuItemClassName}
            onSelect={() => onOpenIconPicker({ kind: "existing", path: folder.path })}
          >
            <SwatchIcon className="w-4 h-4 stroke-[1.6]" />
            Change Icon and Color
          </ContextMenu.Item>
          {folder.path.includes("/") && (
            <>
              <ContextMenu.Separator className={menuSeparatorClassName} />
              <ContextMenu.Item
                className={menuItemClassName}
                onSelect={() =>
                  onMoveFolderToParent(
                    folder.path,
                    folder.path.split("/").slice(0, -2).join("/"),
                  )
                }
              >
                <ArrowUpIcon className="w-4 h-4 stroke-[1.6]" />
                Move to Parent Folder
              </ContextMenu.Item>
            </>
          )}
          <ContextMenu.Separator className={menuSeparatorClassName} />
          <ContextMenu.Item
            className={destructiveMenuItemClassName}
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

export function FolderTreeView({
  pendingFolderPath = null,
}: {
  pendingFolderPath?: string | null;
} = {}) {
  const {
    notes,
    pinnedNotes,
    recentNotes,
    knownFolders,
    hasLoadedFolders,
    notesFolder,
    settings,
    folderAppearances,
    folderSortMode,
    folderRevealRequest,
    showPinnedNotes,
    showRecentNotes,
    showNoteCounts,
    showNotesFromSubfolders,
    selectedScope,
    selectedFolderPath,
    selectFolder,
    selectPinnedNotes,
    selectRecentNotes,
    createNote,
    createNoteInFolder,
    createFolder,
    deleteFolder,
    renameFolder,
    moveFolder,
    setFolderAppearance,
    setCollapsedFolders: persistCollapsedFolders,
  } = useNotes();

  const [collapsedFolders, setCollapsedFoldersState] = useState<Set<string>>(
    () => new Set(),
  );
  const [hasInitializedCollapseState, setHasInitializedCollapseState] =
    useState(false);
  const [inlineEditState, setInlineEditState] =
    useState<InlineFolderEditState | null>(null);
  const [iconPickerTarget, setIconPickerTarget] =
    useState<FolderIconPickerTarget | null>(null);
  const { confirmDeletions, resolvedTheme, setConfirmDeletions } = useTheme();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState<string | null>(null);
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const dontAskAgainId = useId();
  const treeRef = useRef<HTMLDivElement>(null);
  const suppressRootMenuCloseAutoFocusRef = useRef(false);
  const collapsedFoldersRef = useRef<Set<string>>(new Set());
  const locallyToggledCollapsedPathsRef = useRef<Set<string>>(new Set());
  collapsedFoldersRef.current = collapsedFolders;
  const [pendingFolderSelectionPath, setPendingFolderSelectionPath] =
    useState<string | null>(null);
  const [forcedCollapsedFolderPath, setForcedCollapsedFolderPath] =
    useState<string | null>(null);
  const renderedCollapsedFolders = useMemo(() => {
    if (!forcedCollapsedFolderPath) {
      const next = new Set(collapsedFolders);
      settings.collapsedFolders?.forEach((path) => {
        if (!locallyToggledCollapsedPathsRef.current.has(path)) {
          next.add(path);
        }
      });
      return next;
    }

    const next = new Set(collapsedFolders);
    settings.collapsedFolders?.forEach((path) => {
      if (!locallyToggledCollapsedPathsRef.current.has(path)) {
        next.add(path);
      }
    });
    next.add(forcedCollapsedFolderPath);
    return next;
  }, [collapsedFolders, forcedCollapsedFolderPath, settings.collapsedFolders]);

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

  const tree = useMemo(
    () =>
      buildFolderTree(
        notes,
        new Set<string>(),
        knownFolders,
        folderSortMode,
      ),
    [folderSortMode, knownFolders, notes],
  );
  const allFolderPaths = useMemo(() => {
    const paths = new Set(knownFolders);

    const visit = (folder: FolderNode) => {
      paths.add(folder.path);
      folder.children.forEach(visit);
    };

    tree.folders.forEach(visit);
    return [...paths];
  }, [knownFolders, tree]);
  const noteCountForFolder = useCallback(
    (folder: FolderNode) =>
      showNotesFromSubfolders ? countNotesInFolder(folder) : folder.notes.length,
    [showNotesFromSubfolders],
  );
  const rootNoteCount = showNotesFromSubfolders ? notes.length : tree.rootNotes.length;
  const rootFolderLabel = getNotesRootLabel(notesFolder);
  const showVirtualScopeDivider = showPinnedNotes || showRecentNotes;
  const visibleNavigationItems = useMemo(() => {
    const items: Array<
      | { kind: "pinned" | "recent" | "all" }
      | { kind: "folder"; path: string; hasChildren: boolean; isCollapsed: boolean }
    > = [];

    if (showPinnedNotes) items.push({ kind: "pinned" });
    if (showRecentNotes) items.push({ kind: "recent" });
    items.push({ kind: "all" });

    const visit = (folder: FolderNode) => {
      const hasChildren = folder.children.length > 0;
      const isCollapsed = renderedCollapsedFolders.has(folder.path);
      items.push({
        kind: "folder",
        path: folder.path,
        hasChildren,
        isCollapsed,
      });

      if (!isCollapsed) {
        folder.children.forEach(visit);
      }
    };

    tree.folders.forEach(visit);
    return items;
  }, [renderedCollapsedFolders, showPinnedNotes, showRecentNotes, tree.folders]);
  const activeOptionId = useMemo(() => {
    if (selectedScope.type === "pinned" && showPinnedNotes) {
      return getVirtualFolderOptionId("pinned");
    }
    if (selectedScope.type === "recent" && showRecentNotes) {
      return getVirtualFolderOptionId("recent");
    }
    if (selectedScope.type === "all") {
      return getVirtualFolderOptionId("all");
    }
    if (selectedFolderPath) {
      return getFolderOptionId(selectedFolderPath);
    }
    return undefined;
  }, [
    selectedFolderPath,
    selectedScope.type,
    showPinnedNotes,
    showRecentNotes,
  ]);

  useEffect(() => {
    if (!pendingFolderSelectionPath) {
      return;
    }

    if (selectedFolderPath === pendingFolderSelectionPath) {
      setPendingFolderSelectionPath(null);
      return;
    }

    if (knownFolders.includes(pendingFolderSelectionPath)) {
      selectFolder(pendingFolderSelectionPath);
    }
  }, [
    knownFolders,
    pendingFolderSelectionPath,
    selectFolder,
    selectedFolderPath,
  ]);

  useEffect(() => {
    if (!hasLoadedFolders || !selectedFolderPath) {
      return;
    }

    if (
      pendingFolderSelectionPath &&
      selectedFolderPath !== pendingFolderSelectionPath
    ) {
      return;
    }

    const folders = new Set(knownFolders);
    if (folders.has(selectedFolderPath)) {
      return;
    }

    let fallback = getFolderParentPath(selectedFolderPath);
    while (fallback) {
      if (folders.has(fallback)) {
        selectFolder(fallback);
        return;
      }
      fallback = getFolderParentPath(fallback);
    }

    selectFolder(null);
  }, [
    hasLoadedFolders,
    knownFolders,
    pendingFolderSelectionPath,
    selectFolder,
    selectedFolderPath,
  ]);

  useEffect(() => {
    setCollapsedFoldersState(new Set());
    setHasInitializedCollapseState(false);
  }, [notesFolder]);

  useEffect(() => {
    if (hasInitializedCollapseState || !hasLoadedFolders) {
      return;
    }

    if (settings.collapsedFolders !== undefined) {
      setCollapsedFoldersState(new Set(settings.collapsedFolders));
      setHasInitializedCollapseState(true);
      return;
    }

    const initialCollapsedFolders = allFolderPaths;
    setCollapsedFoldersState(new Set(initialCollapsedFolders));
    setHasInitializedCollapseState(true);
    void persistCollapsedFolders(initialCollapsedFolders);
  }, [
    allFolderPaths,
    hasInitializedCollapseState,
    hasLoadedFolders,
    persistCollapsedFolders,
    settings.collapsedFolders,
  ]);

  useEffect(() => {
    if (!hasInitializedCollapseState || settings.collapsedFolders === undefined) {
      return;
    }

    setCollapsedFoldersState(new Set(settings.collapsedFolders));
  }, [hasInitializedCollapseState, settings.collapsedFolders]);

  const { active } = useDndContext();
  const activeDragType = active?.data.current?.type;
  const isContainerDropActive =
    activeDragType === "note" || activeDragType === "folder";

  const focusTree = useCallback(() => {
    requestAnimationFrame(() => {
      const tree = treeRef.current;
      if (!tree || document.activeElement === tree) {
        return;
      }

      tree.focus({ preventScroll: true });
    });
  }, []);

  useEffect(() => {
    const handleFocusFolderTree = () => {
      focusTree();
    };

    window.addEventListener("focus-folder-tree", handleFocusFolderTree);
    return () =>
      window.removeEventListener("focus-folder-tree", handleFocusFolderTree);
  }, [focusTree]);

  const commitCollapsedFolders = useCallback(
    (updater: (prev: Set<string>) => Set<string>) => {
      const next = updater(new Set(collapsedFoldersRef.current));
      setCollapsedFoldersState(next);
      void persistCollapsedFolders([...next]);
    },
    [persistCollapsedFolders],
  );

  const expandFolder = useCallback((folderPath: string) => {
    if (!folderPath) return;

    const parts = folderPath.split("/");
    for (let index = 1; index <= parts.length; index += 1) {
      locallyToggledCollapsedPathsRef.current.add(parts.slice(0, index).join("/"));
    }

    if (
      forcedCollapsedFolderPath &&
      parts.some(
        (_, index) =>
          parts.slice(0, index + 1).join("/") === forcedCollapsedFolderPath,
      )
    ) {
      setForcedCollapsedFolderPath(null);
    }

    commitCollapsedFolders((prev) => {
      const next = new Set(prev);
      for (let index = 1; index <= parts.length; index += 1) {
        next.delete(parts.slice(0, index).join("/"));
      }
      return next;
    });
  }, [commitCollapsedFolders, forcedCollapsedFolderPath]);

  const startCreateFolder = useCallback((parentPath: string) => {
    if (parentPath) {
      expandFolder(parentPath);
    }
    setInlineEditState({ mode: "create", parentPath, appearance: null });
  }, [expandFolder]);

  const startRenameFolder = useCallback((path: string, currentName: string) => {
    setInlineEditState({
      mode: "rename",
      path,
      initialValue: currentName,
      appearance: getFolderAppearance(folderAppearances, path),
      wasCollapsed:
        collapsedFoldersRef.current.has(path) ||
        settings.collapsedFolders?.includes(path) === true,
    });
  }, [folderAppearances, settings.collapsedFolders]);

  useEffect(() => {
    if (!folderRevealRequest) {
      return;
    }

    expandFolder(folderRevealRequest.path);
  }, [expandFolder, folderRevealRequest]);

  useEffect(() => {
    const handleCreateFolder = () => {
      startCreateFolder(selectedFolderPath ?? "");
    };

    window.addEventListener("create-new-folder", handleCreateFolder);
    return () =>
      window.removeEventListener("create-new-folder", handleCreateFolder);
  }, [selectedFolderPath, startCreateFolder]);

  const handleSelectFolder = useCallback((path: string) => {
    focusTree();
    expandFolder(path);
    selectFolder(path);
  }, [expandFolder, focusTree, selectFolder]);

  const handleContextSelectFolder = useCallback((path: string) => {
    focusTree();
    selectFolder(path);
  }, [focusTree, selectFolder]);

  const handleToggleCollapse = useCallback((path: string) => {
    locallyToggledCollapsedPathsRef.current.add(path);

    if (forcedCollapsedFolderPath === path) {
      setForcedCollapsedFolderPath(null);
    }

    commitCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, [commitCollapsedFolders, forcedCollapsedFolderPath]);

  const selectNavigationItem = useCallback(
    (item: (typeof visibleNavigationItems)[number]) => {
      focusTree();

      switch (item.kind) {
        case "pinned":
          selectPinnedNotes();
          break;
        case "recent":
          selectRecentNotes();
          break;
        case "all":
          selectFolder(null);
          break;
        case "folder":
          handleSelectFolder(item.path);
          break;
      }
    },
    [
      focusTree,
      handleSelectFolder,
      selectFolder,
      selectPinnedNotes,
      selectRecentNotes,
    ],
  );

  const getCurrentNavigationIndex = useCallback(() => {
    const selectedIndex = visibleNavigationItems.findIndex((item) => {
      if (item.kind === "folder") {
        return selectedScope.type === "folder" && item.path === selectedFolderPath;
      }
      return selectedScope.type === item.kind;
    });

    return selectedIndex >= 0 ? selectedIndex : 0;
  }, [selectedFolderPath, selectedScope.type, visibleNavigationItems]);

  const handleTreeKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (inlineEditState) return;
      if (visibleNavigationItems.length === 0) return;

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const currentIndex = getCurrentNavigationIndex();
        const direction = event.key === "ArrowDown" ? 1 : -1;
        const nextIndex =
          (currentIndex + direction + visibleNavigationItems.length) %
          visibleNavigationItems.length;
        selectNavigationItem(visibleNavigationItems[nextIndex]);
        return;
      }

      if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        selectNavigationItem(
          visibleNavigationItems[
            event.key === "Home" ? 0 : visibleNavigationItems.length - 1
          ],
        );
        return;
      }

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectNavigationItem(visibleNavigationItems[getCurrentNavigationIndex()]);
        return;
      }

      if (
        event.key === "ArrowLeft" &&
        selectedScope.type === "folder" &&
        selectedFolderPath
      ) {
        const current = visibleNavigationItems.find(
          (item) => item.kind === "folder" && item.path === selectedFolderPath,
        );
        if (current?.kind !== "folder") return;

        event.preventDefault();
        if (current.hasChildren && !current.isCollapsed) {
          handleToggleCollapse(current.path);
          return;
        }

        const parentPath = getFolderParentPath(current.path);
        if (parentPath) {
          handleSelectFolder(parentPath);
        } else {
          focusTree();
          selectFolder(null);
        }
        return;
      }

      if (
        event.key === "ArrowRight" &&
        selectedScope.type === "folder" &&
        selectedFolderPath
      ) {
        const current = visibleNavigationItems.find(
          (item) => item.kind === "folder" && item.path === selectedFolderPath,
        );
        if (
          current?.kind === "folder" &&
          current.hasChildren &&
          current.isCollapsed
        ) {
          event.preventDefault();
          handleToggleCollapse(current.path);
        }
      }
    },
    [
      focusTree,
      getCurrentNavigationIndex,
      handleSelectFolder,
      handleToggleCollapse,
      inlineEditState,
      selectFolder,
      selectNavigationItem,
      selectedFolderPath,
      selectedScope.type,
      visibleNavigationItems,
    ],
  );

  const handleCancelInlineEdit = useCallback(() => {
    setInlineEditState(null);
    setIconPickerTarget(null);
    focusTree();
  }, [focusTree]);

  const handleCreateFolder = useCallback(async (name: string) => {
    if (inlineEditState?.mode !== "create") return;

    const parentPath = inlineEditState.parentPath;
    const folderAppearance = inlineEditState.appearance;
    const folderName = sanitizeFolderName(name);

    if (!folderName) {
      handleCancelInlineEdit();
      return;
    }

    try {
      await createFolder(parentPath, folderName);
      const newPath = parentPath ? `${parentPath}/${folderName}` : folderName;
      if (folderAppearance) {
        try {
          await setFolderAppearance(newPath, folderAppearance);
        } catch (error) {
          console.error("Failed to save new folder style:", error);
          toast.error("Folder created, but failed to save style");
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
    setFolderAppearance,
    selectFolder,
  ]);

  const handleRenameFolder = useCallback(async (newName: string) => {
    if (inlineEditState?.mode !== "rename") return;

    const oldPath = inlineEditState.path;
    const folderAppearance = inlineEditState.appearance;
    const previousFolderAppearance = getFolderAppearance(
      folderAppearances,
      oldPath,
    );
    const sanitizedName = sanitizeFolderName(newName);
    const currentName = getFolderLeaf(oldPath);
    const appearanceChanged = !areFolderAppearancesEqual(
      folderAppearance,
      previousFolderAppearance,
    );

    if (!sanitizedName) {
      handleCancelInlineEdit();
      return;
    }

    const newPath = getRenamedFolderPath(oldPath, sanitizedName);
    let collapsedFoldersBeforeRename: Set<string> | null = null;

    try {
      setPendingFolderSelectionPath(newPath);

      if (sanitizedName === currentName) {
        if (!appearanceChanged) {
          setPendingFolderSelectionPath(null);
          handleCancelInlineEdit();
          return;
        }

        await setFolderAppearance(oldPath, folderAppearance);
        setPendingFolderSelectionPath(null);
        setInlineEditState(null);
        setIconPickerTarget(null);
        focusTree();
        return;
      }

      const wasCollapsed =
        inlineEditState.wasCollapsed ||
        collapsedFoldersRef.current.has(oldPath) ||
        settings.collapsedFolders?.includes(oldPath) === true;
      const collapsedFoldersAfterRename = new Set(collapsedFoldersRef.current);
      if (wasCollapsed) {
        collapsedFoldersBeforeRename = new Set(collapsedFoldersRef.current);
        setForcedCollapsedFolderPath(newPath);
        collapsedFoldersAfterRename.delete(oldPath);
        collapsedFoldersAfterRename.add(newPath);
        setCollapsedFoldersState(collapsedFoldersAfterRename);
      }

      await renameFolder(oldPath, sanitizedName);
      selectFolder(newPath);
      if (wasCollapsed) {
        setForcedCollapsedFolderPath(newPath);
        setCollapsedFoldersState(new Set(collapsedFoldersAfterRename));
        void persistCollapsedFolders([...collapsedFoldersAfterRename]);
      }
      if (appearanceChanged) {
        try {
          await setFolderAppearance(newPath, folderAppearance);
        } catch (error) {
          console.error("Failed to save renamed folder style:", error);
          toast.error("Folder renamed, but failed to save style");
        }
      }
      setInlineEditState(null);
      setIconPickerTarget(null);
      focusTree();
    } catch (error) {
      setPendingFolderSelectionPath(null);
      if (collapsedFoldersBeforeRename) {
        setCollapsedFoldersState(collapsedFoldersBeforeRename);
      }
      setForcedCollapsedFolderPath(null);
      console.error("Failed to rename folder:", error);
      toast.error("Failed to rename folder");
      throw error;
    }
  }, [
    focusTree,
    handleCancelInlineEdit,
    folderAppearances,
    inlineEditState,
    persistCollapsedFolders,
    renameFolder,
    selectFolder,
    setFolderAppearance,
    settings.collapsedFolders,
  ]);

  const pickerValue = useMemo<FolderAppearance | null>(() => {
    if (!iconPickerTarget) return null;

    if (iconPickerTarget.kind === "existing") {
      return getFolderAppearance(folderAppearances, iconPickerTarget.path);
    }

    if (iconPickerTarget.kind === "inline-create") {
      return inlineEditState?.mode === "create" ? inlineEditState.appearance : null;
    }

    return inlineEditState?.mode === "rename" &&
      inlineEditState.path === iconPickerTarget.path
      ? inlineEditState.appearance
      : null;
  }, [folderAppearances, iconPickerTarget, inlineEditState]);

  const pickerTitle = useMemo(() => {
    if (!iconPickerTarget) return "Customize Folder";
    if (iconPickerTarget.kind === "existing") {
      return `Customize ${getFolderLeaf(iconPickerTarget.path)}`;
    }
    if (iconPickerTarget.kind === "inline-create") {
      return "Customize New Folder";
    }
    return `Customize ${getFolderLeaf(iconPickerTarget.path)}`;
  }, [iconPickerTarget]);

  const handleIconPickerApply = useCallback(async (
    folderAppearance: FolderAppearance | null,
  ) => {
    if (!iconPickerTarget) return;

    if (iconPickerTarget.kind === "existing") {
      try {
        await setFolderAppearance(iconPickerTarget.path, folderAppearance);
      } catch (error) {
        console.error("Failed to update folder style:", error);
        toast.error("Failed to update folder style");
        return;
      }

      setIconPickerTarget(null);
      focusTree();
      return;
    }

    setInlineEditState((current) => {
      if (!current) return current;

      if (iconPickerTarget.kind === "inline-create" && current.mode === "create") {
        return { ...current, appearance: folderAppearance };
      }

      if (
        iconPickerTarget.kind === "inline-rename" &&
        current.mode === "rename" &&
        current.path === iconPickerTarget.path
      ) {
        return { ...current, appearance: folderAppearance };
      }

      return current;
    });

    setIconPickerTarget(null);
  }, [focusTree, iconPickerTarget, setFolderAppearance]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!folderToDelete) return;

    if (dontAskAgain) setConfirmDeletions(false);
    try {
      await deleteFolder(folderToDelete);
      setFolderToDelete(null);
      setDeleteDialogOpen(false);
    } catch (error) {
      console.error("Failed to delete folder:", error);
      toast.error("Failed to delete folder");
    }
  }, [deleteFolder, folderToDelete, dontAskAgain, setConfirmDeletions]);

  const { setNodeRef: setRootDropRef, isOver: isOverRoot } = useDroppable({
    id: "drop-folder:root",
    data: { type: "folder-drop-target", path: "" },
  });

  const isCreatingRoot =
    inlineEditState?.mode === "create" && inlineEditState.parentPath === "";

  return (
    <>
      <div
        ref={treeRef}
        tabIndex={0}
        role="listbox"
        aria-label="Folders"
        aria-activedescendant={activeOptionId}
        data-folder-tree
        className="flex flex-col gap-1 px-1.5 pb-1.5 outline-none"
        onKeyDown={handleTreeKeyDown}
        onMouseDown={(event) => {
          if (event.button === 0 || event.button === 2) {
            focusTree();
          }
        }}
      >
        {showPinnedNotes && (
          <div
            id={getVirtualFolderOptionId("pinned")}
            role="option"
            aria-selected={selectedScope.type === "pinned"}
          >
            <button
              type="button"
              tabIndex={-1}
              onClick={() => {
                focusTree();
                selectPinnedNotes();
              }}
              className={`w-full flex items-center gap-3 rounded-[var(--ui-radius-md)] pl-3 pr-2 py-2 text-left transition-[background-color,box-shadow] duration-200 ${
                selectedScope.type === "pinned"
                  ? "bg-bg-muted"
                  : "hover:bg-bg-muted/80"
              }`}
            >
              <span className="flex items-center gap-2 min-w-0 flex-1">
                <PinIcon className="w-4.25 h-4.25 text-text-muted/80 shrink-0 stroke-[1.7]" />
                <span className="text-sm font-medium text-text truncate">
                  Pinned
                </span>
              </span>
              {showNoteCounts && pinnedNotes.length > 0 && (
                <FolderRowTrailing
                  count={pinnedNotes.length}
                  isActive={selectedScope.type === "pinned"}
                />
              )}
            </button>
          </div>
        )}
        {showRecentNotes && (
          <div
            id={getVirtualFolderOptionId("recent")}
            role="option"
            aria-selected={selectedScope.type === "recent"}
          >
            <button
              type="button"
              tabIndex={-1}
              onClick={() => {
                focusTree();
                selectRecentNotes();
              }}
              className={`w-full flex items-center gap-3 rounded-[var(--ui-radius-md)] pl-3 pr-2 py-2 text-left transition-[background-color,box-shadow] duration-200 ${
                selectedScope.type === "recent"
                  ? "bg-bg-muted"
                  : "hover:bg-bg-muted/80"
              }`}
            >
              <span className="flex items-center gap-2 min-w-0 flex-1">
                <History className="w-4.25 h-4.25 text-text-muted/80 shrink-0 stroke-[1.7]" />
                <span className="text-sm font-medium text-text truncate">
                  Recent
                </span>
              </span>
              {showNoteCounts && recentNotes.length > 0 && (
                <FolderRowTrailing
                  count={recentNotes.length}
                  isActive={selectedScope.type === "recent"}
                />
              )}
            </button>
          </div>
        )}
        {showVirtualScopeDivider ? (
          <div
            aria-hidden="true"
            className="mx-3 my-1 border-t border-border/50"
            data-testid="folder-tree-virtual-scope-divider"
          />
        ) : null}
        <ContextMenu.Root>
          <ContextMenu.Trigger asChild>
            <div
              ref={setRootDropRef}
              id={getVirtualFolderOptionId("all")}
              role="option"
              aria-selected={selectedScope.type === "all"}
              className={`rounded-[var(--ui-radius-md)] transition-[background-color,box-shadow] duration-200 ${
                isOverRoot && isContainerDropActive
                  ? "bg-accent/12 ring-1 ring-accent/60"
                  : selectedScope.type === "all"
                    ? "bg-bg-muted"
                    : "hover:bg-bg-muted/80"
              }`}
              onContextMenu={() => selectFolder(null)}
            >
              <button
                type="button"
                tabIndex={-1}
                onClick={() => {
                  focusTree();
                  selectFolder(null);
                }}
                className="w-full flex items-center gap-3 pl-3 pr-2 py-2 text-left"
              >
                <span className="flex items-center gap-2 min-w-0 flex-1">
                  <FolderGlyph
                    className="w-4.25 h-4.25 text-text-muted/80 shrink-0"
                    strokeWidth={1.7}
                  />
                  <span className="text-sm font-medium text-text truncate">
                    {rootFolderLabel}
                  </span>
                </span>
                {showNoteCounts && rootNoteCount > 0 && (
                  <FolderRowTrailing
                    count={rootNoteCount}
                    isActive={selectedScope.type === "all"}
                  />
                )}
              </button>
            </div>
          </ContextMenu.Trigger>
          <ContextMenu.Portal>
            <ContextMenu.Content
              className={`${menuSurfaceClassName} min-w-44 z-50`}
              onCloseAutoFocus={(event) => {
                if (!suppressRootMenuCloseAutoFocusRef.current) return;
                suppressRootMenuCloseAutoFocusRef.current = false;
                event.preventDefault();
              }}
            >
              <ContextMenu.Item
                className={menuItemClassName}
                onSelect={() => {
                  void createNote();
                }}
              >
                <FilePlusCorner className="w-4 h-4 stroke-[1.6]" />
                New Note
              </ContextMenu.Item>
              <ContextMenu.Item
                className={menuItemClassName}
                onSelect={() => {
                  suppressRootMenuCloseAutoFocusRef.current = true;
                  startCreateFolder("");
                }}
              >
                <FolderPlusIcon className="w-4 h-4 stroke-[1.6]" />
                New Subfolder
              </ContextMenu.Item>
            </ContextMenu.Content>
          </ContextMenu.Portal>
        </ContextMenu.Root>

        <div className="flex flex-col gap-1">
          {isCreatingRoot && (
            <InlineFolderRow
              depth={0}
              appearance={
                inlineEditState?.mode === "create"
                  ? inlineEditState.appearance
                  : null
              }
              placeholder="Folder name"
              showNoteCounts={showNoteCounts}
              resolvedTheme={resolvedTheme}
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
              pendingFolderPath={pendingFolderPath}
              folderAppearances={folderAppearances}
              showNoteCounts={showNoteCounts}
              noteCount={noteCountForFolder(folder)}
              getNoteCount={noteCountForFolder}
              selectedFolderPath={selectedFolderPath}
              collapsedFolders={renderedCollapsedFolders}
              inlineEditState={inlineEditState}
              resolvedTheme={resolvedTheme}
              onToggleCollapse={handleToggleCollapse}
              onSelectFolder={handleSelectFolder}
              onContextSelectFolder={handleContextSelectFolder}
              onCreateNoteHere={createNoteInFolder}
              onStartCreateFolder={startCreateFolder}
              onCreateFolder={handleCreateFolder}
              onStartRenameFolder={startRenameFolder}
              onRenameFolder={handleRenameFolder}
              onOpenIconPicker={setIconPickerTarget}
              onCancelInlineEdit={handleCancelInlineEdit}
              onDeleteFolder={(path) => {
                if (!confirmDeletions) {
                  void deleteFolder(path).catch((error) => {
                    console.error("Failed to delete folder:", error);
                    toast.error("Failed to delete folder");
                  });
                  return;
                }
                setDontAskAgain(false);
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
          onApply={(folderAppearance) => {
            void handleIconPickerApply(folderAppearance);
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

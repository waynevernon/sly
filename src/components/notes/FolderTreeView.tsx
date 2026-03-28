import {
  Suspense,
  lazy,
  memo,
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { listen } from "@tauri-apps/api/event";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { useDndContext, useDraggable, useDroppable } from "@dnd-kit/core";
import { FilePlusCorner, History } from "lucide-react";
import { toast } from "sonner";
import { useNotes } from "../../context/NotesContext";
import { useTheme } from "../../context/ThemeContext";
import {
  applyFolderDropOrderPlan,
  buildFolderDropOrderPlan,
  buildFolderTree,
  countNotesInFolder,
  projectFolderDrop,
  type FolderDropOrderPlan,
  type ProjectedFolderDrop,
} from "../../lib/folderTree";
import type {
  FolderAppearance,
  FolderNode,
} from "../../types/note";
import * as notesService from "../../services/notes";
import type { FileChangeEventPayload } from "../../services/notes";
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
    };

type FolderIconPickerTarget =
  | { kind: "existing"; path: string }
  | { kind: "inline-create" }
  | { kind: "inline-rename"; path: string };

interface FolderTreeViewProps {
  dragDelta: { x: number; y: number } | null;
  onManualFolderDropPlanChange?: (plan: FolderDropOrderPlan | null) => void;
  pendingManualFolderDropPlan?: FolderDropOrderPlan | null;
}

const TREE_INDENT_WIDTH = 12;
const DROP_LINE_BASE_OFFSET = 28;

function loadLegacyCollapsedFolders(): Set<string> | null {
  try {
    const saved = localStorage.getItem("sly:collapsedFolders");
    if (!saved) return null;
    return new Set(JSON.parse(saved));
  } catch {
    return null;
  }
}

function sanitizeFolderName(name: string): string {
  return name.replace(/[\/\\:*?"<>|]/g, "-").trim();
}

function getFolderLeaf(path: string): string {
  return path.split("/").pop() || path;
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

function getDropLineStyle(depth: number): CSSProperties {
  return {
    left: `${depth * TREE_INDENT_WIDTH + DROP_LINE_BASE_OFFSET}px`,
  };
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

function FolderCountBadge({ count }: { count: number }) {
  return <span className="ui-count-badge">{count}</span>;
}

function FolderRowTrailing({
  count,
  children,
}: {
  count: number;
  children?: ReactNode;
}) {
  return (
    <div className="ml-auto flex items-center gap-1.5 pl-2 shrink-0">
      {children}
      <div className="ui-count-badge-column">
        <FolderCountBadge count={count} />
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
      className={`rounded-md ${
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
            className="flex h-6 w-6 -my-0.5 shrink-0 items-center justify-center rounded-md text-text-muted/80 transition-colors hover:bg-bg hover:text-text"
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
        {typeof noteCount === "number" && (
          <FolderRowTrailing count={noteCount} />
        )}
      </div>
    </div>
  );
}

interface FolderItemProps {
  folder: FolderNode;
  depth: number;
  isManualSorting: boolean;
  folderAppearances: FolderAppearanceMap;
  selectedFolderPath: string | null;
  collapsedFolders: Set<string>;
  inlineEditState: InlineFolderEditState | null;
  projectedDrop: ProjectedFolderDrop | null;
  resolvedTheme: "light" | "dark";
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
  isManualSorting,
  folderAppearances,
  selectedFolderPath,
  collapsedFolders,
  inlineEditState,
  projectedDrop,
  resolvedTheme,
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
  const suppressCloseAutoFocusRef = useRef(false);
  const isCollapsed = collapsedFolders.has(folder.path);
  const noteCount = countNotesInFolder(folder);
  const folderAppearance = getFolderAppearance(folderAppearances, folder.path);
  const folderTextStyle = getFolderTextStyle(folderAppearance, resolvedTheme);
  const folderIconStyle = getFolderIconStyle(folderAppearance, resolvedTheme);
  const parentPath = getFolderParentPath(folder.path);
  const isRenaming =
    inlineEditState?.mode === "rename" && inlineEditState.path === folder.path;
  const isCreatingChild =
    inlineEditState?.mode === "create" &&
    inlineEditState.parentPath === folder.path;
  const { active } = useDndContext();
  const activeDragType = active?.data.current?.type;
  const isContainerDropActive =
    activeDragType === "note" ||
    (activeDragType === "folder" && active?.data.current?.manualSort !== true);

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
      parentPath,
      manualSort: isManualSorting,
    },
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `drop-folder:${folder.path}`,
    data: {
      type: "folder-drop-target",
      path: folder.path,
    },
  });

  const rowClassName = `rounded-md transition-[background-color,box-shadow,opacity] duration-200 ${
    isOver && isContainerDropActive
      ? "bg-accent/12 ring-1 ring-accent/60"
      : selectedFolderPath === folder.path
        ? "bg-bg-muted"
        : "hover:bg-bg-muted/80"
  }`;
  const showTopDropLine = projectedDrop?.afterPath === folder.path;
  const showBottomDropLine =
    !projectedDrop?.afterPath && projectedDrop?.beforePath === folder.path;
  const dropLineStyle = projectedDrop
    ? getDropLineStyle(projectedDrop.depth)
    : undefined;
  const hasNestedFolders = folder.children.length > 0 || isCreatingChild;

  const children = !isCollapsed && (isCreatingChild || folder.children.length > 0) && (
    <div className="flex flex-col gap-0.5 pt-0.5">
      {isCreatingChild && (
        <InlineFolderRow
          depth={depth + 1}
          appearance={inlineEditState?.mode === "create" ? inlineEditState.appearance : null}
          placeholder="Folder name"
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
          isManualSorting={isManualSorting}
          folderAppearances={folderAppearances}
          selectedFolderPath={selectedFolderPath}
          collapsedFolders={collapsedFolders}
          inlineEditState={inlineEditState}
          projectedDrop={projectedDrop}
          resolvedTheme={resolvedTheme}
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
  );

  const content = isRenaming ? (
    <>
      <InlineFolderRow
        depth={depth}
        initialValue={inlineEditState?.mode === "rename" ? inlineEditState.initialValue : ""}
        appearance={inlineEditState?.mode === "rename" ? inlineEditState.appearance : null}
        placeholder="Folder name"
        noteCount={noteCount}
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
      <div className={`relative ${isDragging ? "opacity-40" : ""}`}>
        {showTopDropLine && dropLineStyle && (
          <div
            className="folder-tree-drop-line folder-tree-drop-line-top"
            style={dropLineStyle}
          />
        )}
        <div
          ref={setDropRef}
          className={rowClassName}
        >
          <div className="flex items-center gap-1.5 pr-2 py-2" style={{ paddingLeft: `${depth * TREE_INDENT_WIDTH}px` }}>
            <div className="min-w-0 flex flex-1 items-center gap-1.5">
              {hasNestedFolders ? (
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
              ) : (
                <span className="ml-2 h-5 w-5 shrink-0" aria-hidden="true" />
              )}
              <button
                type="button"
                ref={setDragRef}
                {...dragAttributes}
                {...dragListeners}
                className="flex h-6 w-6 -my-0.5 shrink-0 items-center justify-center rounded-md text-text-muted/80 transition-colors hover:bg-bg hover:text-text cursor-grab active:cursor-grabbing"
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
              <button
                type="button"
                onClick={() => onSelectFolder(folder.path)}
                className="min-w-0 flex-1 text-left"
              >
                <span
                  className="text-sm text-text truncate block"
                  style={folderTextStyle}
                >
                  {folder.name}
                </span>
              </button>
            </div>
            <FolderRowTrailing count={noteCount} />
          </div>
        </div>
        {showBottomDropLine && dropLineStyle && (
          <div
            className="folder-tree-drop-line folder-tree-drop-line-bottom"
            style={dropLineStyle}
          />
        )}
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
            Customize Folder
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
  dragDelta,
  onManualFolderDropPlanChange,
  pendingManualFolderDropPlan = null,
}: FolderTreeViewProps) {
  const {
    notes,
    recentNotes,
    notesFolder,
    settings,
    folderAppearances,
    folderSortMode,
    folderManualOrder,
    showRecentNotes,
    selectedScope,
    selectedFolderPath,
    selectFolder,
    selectRecentNotes,
    createNoteInFolder,
    createFolder,
    deleteFolder,
    renameFolder,
    moveFolder,
    setFolderAppearance,
    setCollapsedFolders: persistCollapsedFolders,
  } = useNotes();

  const [collapsedFolders, setCollapsedFoldersState] = useState<Set<string>>(
    new Set(),
  );
  const [knownFolders, setKnownFolders] = useState<string[]>([]);
  const [hasLoadedKnownFolders, setHasLoadedKnownFolders] = useState(false);
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
  const collapsedFoldersRef = useRef<Set<string>>(new Set());
  collapsedFoldersRef.current = collapsedFolders;
  const folderLoadRequestIdRef = useRef(0);
  const folderReloadTimeoutRef = useRef<number | null>(null);

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

  const loadKnownFolders = useCallback(async () => {
    if (!notesFolder) {
      folderLoadRequestIdRef.current += 1;
      setKnownFolders([]);
      setHasLoadedKnownFolders(true);
      return;
    }

    const requestId = ++folderLoadRequestIdRef.current;
    setHasLoadedKnownFolders(false);

    try {
      const folders = await notesService.listFolders();
      if (requestId !== folderLoadRequestIdRef.current) return;
      setKnownFolders(folders);
      setHasLoadedKnownFolders(true);
    } catch {
      if (requestId !== folderLoadRequestIdRef.current) return;
      setKnownFolders([]);
      setHasLoadedKnownFolders(true);
    }
  }, [notesFolder]);

  const scheduleKnownFoldersReload = useCallback(
    (delay = 120) => {
      if (folderReloadTimeoutRef.current) {
        clearTimeout(folderReloadTimeoutRef.current);
      }

      folderReloadTimeoutRef.current = window.setTimeout(() => {
        folderReloadTimeoutRef.current = null;
        void loadKnownFolders();
      }, delay);
    },
    [loadKnownFolders],
  );

  useEffect(() => {
    scheduleKnownFoldersReload(0);
  }, [notes, notesFolder, scheduleKnownFoldersReload]);

  useEffect(() => {
    let isCancelled = false;
    let unlisten: (() => void) | undefined;

    listen<FileChangeEventPayload>("file-change", (event) => {
      if (isCancelled || !event.payload.folder_structure_changed) {
        return;
      }

      scheduleKnownFoldersReload();
    }).then((fn) => {
      if (isCancelled) {
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
  }, [scheduleKnownFoldersReload]);

  useEffect(() => {
    return () => {
      if (folderReloadTimeoutRef.current) {
        clearTimeout(folderReloadTimeoutRef.current);
        folderReloadTimeoutRef.current = null;
      }
    };
  }, []);

  const tree = useMemo(
    () =>
      buildFolderTree(
        notes,
        new Set<string>(),
        knownFolders,
        folderSortMode,
        folderManualOrder,
      ),
    [folderManualOrder, folderSortMode, knownFolders, notes],
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

  useEffect(() => {
    if (!hasLoadedKnownFolders || !selectedFolderPath) {
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
  }, [hasLoadedKnownFolders, knownFolders, selectFolder, selectedFolderPath]);

  useEffect(() => {
    setCollapsedFoldersState(new Set());
    setHasInitializedCollapseState(false);
  }, [notesFolder]);

  useEffect(() => {
    if (hasInitializedCollapseState || !hasLoadedKnownFolders) {
      return;
    }

    if (settings.collapsedFolders !== undefined) {
      setCollapsedFoldersState(new Set(settings.collapsedFolders));
      setHasInitializedCollapseState(true);
      return;
    }

    const legacyCollapsedFolders = loadLegacyCollapsedFolders();
    const initialCollapsedFolders = legacyCollapsedFolders
      ? allFolderPaths.filter((path) => legacyCollapsedFolders.has(path))
      : allFolderPaths;

    setCollapsedFoldersState(new Set(initialCollapsedFolders));
    setHasInitializedCollapseState(true);
    void persistCollapsedFolders(initialCollapsedFolders);
  }, [
    allFolderPaths,
    hasInitializedCollapseState,
    hasLoadedKnownFolders,
    persistCollapsedFolders,
    settings.collapsedFolders,
  ]);

  useEffect(() => {
    if (!hasInitializedCollapseState || settings.collapsedFolders === undefined) {
      return;
    }

    setCollapsedFoldersState(new Set(settings.collapsedFolders));
  }, [hasInitializedCollapseState, settings.collapsedFolders]);

  const visibleCollapsedFolders = useMemo(() => {
    if (!pendingManualFolderDropPlan?.targetParentPath) {
      return collapsedFolders;
    }

    const next = new Set(collapsedFolders);
    next.delete(pendingManualFolderDropPlan.targetParentPath);
    return next;
  }, [collapsedFolders, pendingManualFolderDropPlan]);
  const displayTree = useMemo(
    () =>
      pendingManualFolderDropPlan
        ? applyFolderDropOrderPlan(tree, pendingManualFolderDropPlan)
        : tree,
    [pendingManualFolderDropPlan, tree],
  );
  const { active, over } = useDndContext();
  const activeDragType = active?.data.current?.type;
  const isContainerDropActive =
    activeDragType === "note" ||
    (activeDragType === "folder" && active?.data.current?.manualSort !== true);
  const activeManualFolderPath =
    folderSortMode === "manual" &&
    activeDragType === "folder" &&
    active?.data.current?.manualSort === true
      ? (active.data.current?.path as string)
      : null;
  const projectedDrop = useMemo(() => {
    if (!activeManualFolderPath || !dragDelta) {
      return null;
    }

    if (over?.data.current?.type !== "folder-drop-target") {
      return null;
    }

    const overPath = over.data.current?.path;
    const initialRect = active?.rect.current.initial;
    if (!overPath || !initialRect) {
      return null;
    }

    const currentCenterY = initialRect.top + dragDelta.y + initialRect.height / 2;
    const placement =
      currentCenterY < over.rect.top + over.rect.height / 2 ? "before" : "after";

    return projectFolderDrop({
      tree,
      collapsedFolders,
      activePath: activeManualFolderPath,
      overPath,
      placement,
      horizontalOffset: dragDelta.x,
      indentationWidth: TREE_INDENT_WIDTH,
    });
  }, [active, activeManualFolderPath, collapsedFolders, dragDelta, over, tree]);
  const manualFolderDropPlan = useMemo(() => {
    if (!activeManualFolderPath || !projectedDrop) {
      return null;
    }

    return buildFolderDropOrderPlan(tree, activeManualFolderPath, projectedDrop);
  }, [activeManualFolderPath, projectedDrop, tree]);

  const focusTree = useCallback(() => {
    requestAnimationFrame(() => {
      treeRef.current?.focus();
    });
  }, []);

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

    commitCollapsedFolders((prev) => {
      const next = new Set(prev);
      const parts = folderPath.split("/");
      for (let index = 1; index <= parts.length; index += 1) {
        next.delete(parts.slice(0, index).join("/"));
      }
      return next;
    });
  }, [commitCollapsedFolders]);

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
    });
  }, [folderAppearances]);

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
    commitCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, [commitCollapsedFolders]);

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

    try {
      const newPath = getRenamedFolderPath(oldPath, sanitizedName);
      if (sanitizedName === currentName) {
        if (!appearanceChanged) {
          handleCancelInlineEdit();
          return;
        }

        await setFolderAppearance(oldPath, folderAppearance);
        selectFolder(oldPath);
        setInlineEditState(null);
        setIconPickerTarget(null);
        focusTree();
        return;
      }

      await renameFolder(oldPath, sanitizedName);
      if (appearanceChanged) {
        try {
          await setFolderAppearance(newPath, folderAppearance);
        } catch (error) {
          console.error("Failed to save renamed folder style:", error);
          toast.error("Folder renamed, but failed to save style");
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
    folderAppearances,
    inlineEditState,
    renameFolder,
    setFolderAppearance,
    selectFolder,
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

  useEffect(() => {
    onManualFolderDropPlanChange?.(manualFolderDropPlan);
  }, [manualFolderDropPlan, onManualFolderDropPlanChange]);

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
        data-folder-tree
        className="flex flex-col gap-1 px-1.5 pb-1.5 outline-none"
      >
        {showRecentNotes && (
          <button
            type="button"
            onClick={selectRecentNotes}
            className={`w-full flex items-center gap-3 rounded-md pl-3 pr-2 py-2 text-left transition-[background-color,box-shadow] duration-200 ${
              selectedScope.type === "recent"
                ? "bg-bg-muted"
                : "hover:bg-bg-muted/80"
            }`}
          >
            <span className="flex items-center gap-2 min-w-0 flex-1">
              <History className="w-4.25 h-4.25 text-text-muted/80 shrink-0 stroke-[1.7]" />
              <span className="text-sm font-medium text-text truncate">
                Recent Notes
              </span>
            </span>
            <FolderRowTrailing count={recentNotes.length} />
          </button>
        )}
        <div
          ref={setRootDropRef}
          className={`rounded-md transition-[background-color,box-shadow] duration-200 ${
            isOverRoot && isContainerDropActive
              ? "bg-accent/12 ring-1 ring-accent/60"
              : selectedScope.type === "all"
                ? "bg-bg-muted"
                : "hover:bg-bg-muted/80"
          }`}
        >
          <button
            type="button"
            onClick={() => selectFolder(null)}
            className="w-full flex items-center gap-3 pl-3 pr-2 py-2 text-left"
          >
            <span className="flex items-center gap-2 min-w-0 flex-1">
              <FolderGlyph
                className="w-4.25 h-4.25 text-text-muted/80 shrink-0"
                strokeWidth={1.7}
              />
              <span className="text-sm font-medium text-text truncate">
                All Notes
              </span>
            </span>
            <FolderRowTrailing count={notes.length} />
          </button>
        </div>

        <div className="flex flex-col gap-0.5">
          {isCreatingRoot && (
            <InlineFolderRow
              depth={0}
              appearance={
                inlineEditState?.mode === "create"
                  ? inlineEditState.appearance
                  : null
              }
              placeholder="Folder name"
              resolvedTheme={resolvedTheme}
              onSubmit={handleCreateFolder}
              onCancel={handleCancelInlineEdit}
              onOpenIconPicker={() => setIconPickerTarget({ kind: "inline-create" })}
            />
          )}

          {displayTree.folders.map((folder) => (
            <FolderItem
              key={folder.path}
              folder={folder}
              depth={0}
              isManualSorting={folderSortMode === "manual"}
              folderAppearances={folderAppearances}
              selectedFolderPath={selectedFolderPath}
              collapsedFolders={visibleCollapsedFolders}
              inlineEditState={inlineEditState}
              projectedDrop={projectedDrop}
              resolvedTheme={resolvedTheme}
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

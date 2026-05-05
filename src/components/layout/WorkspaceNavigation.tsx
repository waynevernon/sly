import { useCallback, useEffect, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  type Modifier,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CheckSquare } from "lucide-react";
import type { PaneMode } from "../../types/note";
import { useNotes } from "../../context/NotesContext";
import { useTasks } from "../../context/TasksContext";
import { useTheme } from "../../context/ThemeContext";
import { workspaceCollisionDetection } from "../../lib/dragCollision";
import type { FolderPathChange } from "../../lib/folderTree";
import { cn } from "../../lib/utils";
import { TASK_DRAG_TARGET_VIEWS, localDateToNormalizedActionAt } from "../../lib/tasks";
import type { TaskView } from "../../types/tasks";
import { NoteIcon } from "../icons";
import { FolderGlyph } from "../folders/FolderGlyph";
import {
  getFolderAppearance,
  resolveFolderAppearanceIconColor,
  resolveFolderAppearanceTextColor,
} from "../../lib/folderIcons";
import { PaneResizeHandle } from "./PaneResizeHandle";
import { FoldersPane } from "./FoldersPane";
import { NotesPane } from "./NotesPane";
import { TaskListPane } from "../tasks/TaskListPane";
import { TaskNavigationPane } from "../tasks/TaskNavigationPane";

interface WorkspaceNavigationProps {
  paneMode: PaneMode;
  workspaceMode: "notes" | "tasks";
  onOpenSettings?: () => void;
  onShowNotes?: () => void;
  onShowTasks?: () => void;
}

const ITEM_DRAG_CURSOR_INSET_X = 12;
const ITEM_DRAG_CURSOR_INSET_Y = 8;

function getEventClientCoordinates(event: Event | null): {
  x: number;
  y: number;
} | null {
  if (!event) return null;

  const pointerLikeEvent = event as Event & {
    clientX?: number;
    clientY?: number;
  };
  if (
    typeof pointerLikeEvent.clientX === "number" &&
    typeof pointerLikeEvent.clientY === "number"
  ) {
    return {
      x: pointerLikeEvent.clientX,
      y: pointerLikeEvent.clientY,
    };
  }

  const touchLikeEvent = event as Event & {
    touches?: ArrayLike<{ clientX: number; clientY: number }>;
    changedTouches?: ArrayLike<{ clientX: number; clientY: number }>;
  };
  const touch = touchLikeEvent.touches?.[0] ?? touchLikeEvent.changedTouches?.[0];
  if (touch) {
    return {
      x: touch.clientX,
      y: touch.clientY,
    };
  }

  return null;
}

function getOverlayHotspot(overlaySize: number, inset: number): number {
  if (overlaySize <= 0) {
    return inset;
  }

  return Math.min(inset, overlaySize / 2);
}

function getMovedFolderPath(path: string, targetParent: string): string {
  const folderName = path.includes("/")
    ? path.substring(path.lastIndexOf("/") + 1)
    : path;

  return targetParent ? `${targetParent}/${folderName}` : folderName;
}

export function WorkspaceNavigation({
  paneMode,
  workspaceMode,
  onOpenSettings,
  onShowNotes,
  onShowTasks,
}: WorkspaceNavigationProps) {
  const {
    moveFolder,
    moveNote,
    moveSelectedNotes,
    revealFolder,
    folderAppearances,
  } = useNotes();
  const { tasks, today, updateTask, setCompleted } = useTasks();
  const { foldersPaneWidth, notesPaneWidth, resolvedTheme, setPaneWidths } =
    useTheme();

  const [liveWidths, setLiveWidths] = useState({
    folders: foldersPaneWidth,
    notes: notesPaneWidth,
  });
  const [isResizing, setIsResizing] = useState(false);
  const resizeDragRef = useRef<{
    target: "folders" | "notes";
    startX: number;
    startWidth: number;
  } | null>(null);

  // Sync live widths from persisted settings when not dragging
  useEffect(() => {
    if (!isResizing) {
      setLiveWidths({ folders: foldersPaneWidth, notes: notesPaneWidth });
    }
  }, [foldersPaneWidth, notesPaneWidth, isResizing]);

  const startResize = useCallback(
    (e: React.MouseEvent, target: "folders" | "notes") => {
      e.preventDefault();
      e.stopPropagation();
      const startWidth = target === "folders" ? liveWidths.folders : liveWidths.notes;
      resizeDragRef.current = { target, startX: e.clientX, startWidth };
      setIsResizing(true);

      const onMouseMove = (ev: MouseEvent) => {
        const ref = resizeDragRef.current;
        if (!ref) return;
        const delta = ev.clientX - ref.startX;
        const raw = ref.startWidth + delta;
        if (ref.target === "folders") {
          const clamped = Math.min(Math.max(raw, 140), 480);
          setLiveWidths((prev) => ({ ...prev, folders: clamped }));
        } else {
          const clamped = Math.min(Math.max(raw, 180), 560);
          setLiveWidths((prev) => ({ ...prev, notes: clamped }));
        }
      };

      const onMouseUp = () => {
        const ref = resizeDragRef.current;
        resizeDragRef.current = null;
        setIsResizing(false);
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        if (ref) {
          setLiveWidths((prev) => {
            setPaneWidths(prev.folders, prev.notes);
            return prev;
          });
        }
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [liveWidths, setPaneWidths],
  );

  const [dragLabel, setDragLabel] = useState<string | null>(null);
  const [dragType, setDragType] = useState<"folder" | "note" | "task" | null>(null);
  const [dragFolderPath, setDragFolderPath] = useState<string | null>(null);
  const [pendingFolderPath, setPendingFolderPath] = useState<string | null>(null);
  const [pendingFolderPathChange, setPendingFolderPathChange] =
    useState<FolderPathChange | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const clearDragState = useCallback(() => {
    setDragLabel(null);
    setDragType(null);
    setDragFolderPath(null);
  }, []);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current;
    if (data?.type === "note") {
      const noteIds = Array.isArray(data.ids)
        ? (data.ids as string[])
        : [(data.id as string) ?? ""];
      if (noteIds.length > 1) {
        setDragLabel(`${noteIds.length} notes`);
      } else {
        const noteId = noteIds[0];
        const leaf = noteId.includes("/")
          ? noteId.substring(noteId.lastIndexOf("/") + 1)
          : noteId;
        setDragLabel(leaf);
      }
      setDragType("note");
      setDragFolderPath(null);
      return;
    }

    if (data?.type === "folder") {
      const path = data.path as string;
      const name = path.includes("/")
        ? path.substring(path.lastIndexOf("/") + 1)
        : path;
      setDragLabel(name);
      setDragType("folder");
      setDragFolderPath(path);
      return;
    }

    if (data?.type === "task") {
      const taskIds = Array.isArray(data.ids)
        ? (data.ids as string[])
        : [(data.id as string) ?? ""];
      setDragLabel(taskIds.length > 1 ? `${taskIds.length} tasks` : ((data.title as string) || "Untitled"));
      setDragType("task");
      setDragFolderPath(null);
    }
  }, []);

  const itemDragOverlayModifier = useCallback<Modifier>(
    ({ active, activatorEvent, activeNodeRect, overlayNodeRect, transform }) => {
      if (
        (active?.data.current?.type !== "note" &&
          active?.data.current?.type !== "task") ||
        !activeNodeRect ||
        !overlayNodeRect
      ) {
        return transform;
      }

      const pointer = getEventClientCoordinates(activatorEvent);
      if (!pointer) {
        return transform;
      }

      const sourceOffsetX = pointer.x - activeNodeRect.left;
      const sourceOffsetY = pointer.y - activeNodeRect.top;

      const overlayHotspotX = getOverlayHotspot(
        overlayNodeRect.width,
        ITEM_DRAG_CURSOR_INSET_X,
      );
      const overlayHotspotY = getOverlayHotspot(
        overlayNodeRect.height,
        ITEM_DRAG_CURSOR_INSET_Y,
      );

      return {
        ...transform,
        x: transform.x + sourceOffsetX - overlayHotspotX,
        y: transform.y + sourceOffsetY - overlayHotspotY,
      };
    },
    [],
  );

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    const activeData = active.data.current;
    const overData = over?.data.current;
    if (!activeData) return;

    try {
      if (activeData.type === "note") {
        clearDragState();
        if (!overData) return;

        const targetFolder = (overData.path as string) || "";
        const noteIds = Array.isArray(activeData.ids)
          ? (activeData.ids as string[])
          : [activeData.id as string];
        const noteId = activeData.id as string;
        const noteParent = noteId.includes("/")
          ? noteId.substring(0, noteId.lastIndexOf("/"))
          : "";
        if (
          noteIds.length === 1 &&
          noteParent === targetFolder
        ) {
          return;
        }
        if (noteIds.length > 1) {
          await moveSelectedNotes(targetFolder);
        } else {
          await moveNote(noteId, targetFolder);
        }
        if (targetFolder) {
          revealFolder(targetFolder);
        }
        return;
      }

      if (activeData.type === "folder") {
        clearDragState();
        if (!overData) return;

        const targetFolder = (overData.path as string) || "";
        const folderPath = activeData.path as string;
        const folderParent = folderPath.includes("/")
          ? folderPath.substring(0, folderPath.lastIndexOf("/"))
          : "";

        if (
          targetFolder === folderPath ||
          targetFolder.startsWith(folderPath + "/") ||
          folderParent === targetFolder
        ) {
          return;
        }

        setPendingFolderPath(folderPath);
        setPendingFolderPathChange({
          oldPath: folderPath,
          newPath: getMovedFolderPath(folderPath, targetFolder),
        });
        try {
          await moveFolder(folderPath, targetFolder);
        } finally {
          setPendingFolderPath((currentPath) =>
            currentPath === folderPath ? null : currentPath,
          );
          setPendingFolderPathChange((currentChange) =>
            currentChange?.oldPath === folderPath ? null : currentChange,
          );
        }
        return;
      }

      if (activeData.type === "task") {
        clearDragState();
        if (overData?.type !== "task-view-drop-target") return;

        const targetView = overData.view as TaskView;
        if (!TASK_DRAG_TARGET_VIEWS.includes(targetView)) {
          return;
        }

        const taskIds = Array.isArray(activeData.ids)
          ? (activeData.ids as string[])
          : [activeData.id as string];

        await Promise.all(
          taskIds.map(async (taskId) => {
            const task = tasks.find((entry) => entry.id === taskId);
            if (!task) {
              return;
            }

            if (targetView === "completed") {
              if (!task.completedAt) {
                await setCompleted(taskId, true);
              }
              return;
            }

            if (task.completedAt) {
              await setCompleted(taskId, false);
            }

            const patch =
              targetView === "inbox"
                ? {
                    actionAt: null,
                    scheduleBucket: null,
                  }
                : targetView === "today"
                  ? {
                      actionAt: localDateToNormalizedActionAt(today),
                      scheduleBucket: null,
                    }
                  : targetView === "anytime" || targetView === "someday"
                    ? {
                        actionAt: null,
                        scheduleBucket: targetView,
                      }
                    : null;

            if (!patch) {
              return;
            }

            await updateTask(taskId, patch);
          }),
        );
      }
    } catch (error) {
      console.error("Failed to move item:", error);
    }
  }, [
    clearDragState,
    moveFolder,
    moveNote,
    moveSelectedNotes,
    revealFolder,
    setCompleted,
    tasks,
    today,
    updateTask,
  ]);

  const foldersVisible = paneMode === 3;
  const notesVisible = paneMode >= 2;
  const isTasksModeActive = workspaceMode === "tasks";

  return (
    <DndContext
      collisionDetection={workspaceCollisionDetection}
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={clearDragState}
    >
      <div className={cn("h-full flex shrink-0", isResizing && "select-none")}>
        <div
          className={cn(
            "relative h-full shrink-0",
            !isResizing && "transition-[width] duration-[var(--ui-motion-duration-layout)] ease-[var(--ui-motion-ease-standard)]",
            !foldersVisible && "w-0 pointer-events-none",
          )}
          style={foldersVisible ? { width: liveWidths.folders } : undefined}
        >
          <div
            className={cn(
              "relative h-full overflow-visible",
              !isResizing && "transition-[opacity,transform] duration-[var(--ui-motion-duration-layout)] ease-[var(--ui-motion-ease-standard)]",
              foldersVisible
                ? "opacity-100 translate-x-0"
                : "opacity-0 -translate-x-3",
            )}
          >
            <div className="h-full" hidden={isTasksModeActive}>
              <FoldersPane
                onOpenSettings={onOpenSettings}
                pendingFolderPath={pendingFolderPath}
                pendingFolderPathChange={pendingFolderPathChange}
                onShowNotes={onShowNotes}
                onShowTasks={onShowTasks}
              />
            </div>
            <div className="h-full" hidden={!isTasksModeActive}>
              <TaskNavigationPane
                onOpenSettings={onOpenSettings}
                onShowNotes={onShowNotes}
                onShowTasks={onShowTasks}
              />
            </div>
          </div>
          {foldersVisible && notesVisible && (
            <PaneResizeHandle
              ariaLabel="Resize folders pane"
              align="right"
              onMouseDown={(e) => startResize(e, "folders")}
            />
          )}
        </div>

        <div
          className={cn(
            "relative h-full shrink-0",
            !isResizing && "transition-[width] duration-[var(--ui-motion-duration-layout)] ease-[var(--ui-motion-ease-standard)]",
            !notesVisible && "w-0 pointer-events-none",
          )}
          style={notesVisible ? { width: liveWidths.notes } : undefined}
        >
          <div
            className={cn(
              "h-full overflow-visible",
              !isResizing && "transition-[opacity,transform] duration-[var(--ui-motion-duration-layout)] ease-[var(--ui-motion-ease-standard)]",
              notesVisible
                ? "opacity-100 translate-x-0"
                : "opacity-0 -translate-x-3",
            )}
          >
            {isTasksModeActive ? <TaskListPane /> : <NotesPane />}
          </div>
          {notesVisible && (
            <PaneResizeHandle
              ariaLabel="Resize notes pane"
              align="right"
              onMouseDown={(e) => startResize(e, "notes")}
            />
          )}
        </div>
      </div>

      <DragOverlay
        dropAnimation={null}
        modifiers={[itemDragOverlayModifier]}
        style={{ width: "max-content", height: "max-content" }}
      >
        {dragLabel && (
          <div className="flex items-center gap-2 rounded-[var(--ui-radius-md)] border border-border/80 bg-bg-secondary/95 px-2.5 py-1.5 text-sm leading-none text-text shadow-lg backdrop-blur-sm">
            {(() => {
              const dragFolderAppearance = getFolderAppearance(
                folderAppearances,
                dragFolderPath,
              );
              const dragFolderIconColor = resolveFolderAppearanceIconColor(
                dragFolderAppearance,
                resolvedTheme,
              );
              const dragFolderTextColor = resolveFolderAppearanceTextColor(
                dragFolderAppearance,
                resolvedTheme,
              );

              return (
                <>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-visible text-text/70">
                    {dragType === "folder" ? (
                      <FolderGlyph
                        icon={dragFolderAppearance?.icon ?? null}
                        className="w-4.25 h-4.25 shrink-0"
                        strokeWidth={1.75}
                        style={dragFolderIconColor ? { color: dragFolderIconColor } : undefined}
                      />
                    ) : dragType === "task" ? (
                      <CheckSquare className="w-4 h-4 stroke-[1.8] opacity-60 shrink-0" />
                    ) : (
                      <NoteIcon className="w-4 h-4 stroke-[1.6] opacity-50 shrink-0" />
                    )}
                  </span>
                  <span
                    className="block truncate"
                    style={dragType === "folder" && dragFolderTextColor
                      ? { color: dragFolderTextColor }
                      : undefined}
                  >
                    {dragLabel}
                  </span>
                </>
              );
            })()}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

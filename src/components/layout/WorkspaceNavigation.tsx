import { useCallback, useEffect, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { PaneMode } from "../../types/note";
import { useNotes } from "../../context/NotesContext";
import { useTheme } from "../../context/ThemeContext";
import type { FolderDropOrderPlan } from "../../lib/folderTree";
import { cn } from "../../lib/utils";
import { NoteIcon } from "../icons";
import { FolderGlyph } from "../folders/FolderGlyph";
import { getFolderIconName } from "../../lib/folderIcons";
import { FoldersPane } from "./FoldersPane";
import { NotesPane } from "./NotesPane";

interface WorkspaceNavigationProps {
  paneMode: PaneMode;
  onOpenSettings?: () => void;
}

export function WorkspaceNavigation({
  paneMode,
  onOpenSettings,
}: WorkspaceNavigationProps) {
  const { moveFolder, moveNote, folderIcons, setFolderManualOrder } = useNotes();
  const { foldersPaneWidth, notesPaneWidth, setPaneWidths } = useTheme();

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
  const [dragType, setDragType] = useState<"folder" | "note" | null>(null);
  const [dragFolderPath, setDragFolderPath] = useState<string | null>(null);
  const [dragDelta, setDragDelta] = useState<{ x: number; y: number } | null>(null);
  const [manualFolderDropPlan, setManualFolderDropPlan] =
    useState<FolderDropOrderPlan | null>(null);
  const [pendingManualFolderDropPlan, setPendingManualFolderDropPlan] =
    useState<FolderDropOrderPlan | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const clearDragState = useCallback(() => {
    setDragLabel(null);
    setDragType(null);
    setDragFolderPath(null);
    setDragDelta(null);
    setManualFolderDropPlan(null);
  }, []);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setDragDelta({ x: 0, y: 0 });
    setManualFolderDropPlan(null);

    const data = event.active.data.current;
    if (data?.type === "note") {
      const noteId = data.id as string;
      const leaf = noteId.includes("/")
        ? noteId.substring(noteId.lastIndexOf("/") + 1)
        : noteId;
      setDragLabel(leaf);
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
    }
  }, []);

  const handleDragMove = useCallback((event: DragMoveEvent) => {
    setDragDelta({ x: event.delta.x, y: event.delta.y });
  }, []);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    const activeData = active.data.current;
    const overData = over?.data.current;
    const nextManualFolderDropPlan = manualFolderDropPlan;
    clearDragState();
    if (!activeData) return;

    try {
      if (activeData.type === "note") {
        if (!overData) return;

        const targetFolder = (overData.path as string) || "";
        const noteId = activeData.id as string;
        const noteParent = noteId.includes("/")
          ? noteId.substring(0, noteId.lastIndexOf("/"))
          : "";
        if (noteParent === targetFolder) return;
        await moveNote(noteId, targetFolder);
        if (targetFolder) {
          window.dispatchEvent(
            new CustomEvent("expand-folder", { detail: targetFolder }),
          );
        }
        return;
      }

      if (activeData.type === "folder" && activeData.manualSort === true) {
        const folderPath = activeData.path as string;
        if (
          !nextManualFolderDropPlan ||
          nextManualFolderDropPlan.activePath !== folderPath ||
          nextManualFolderDropPlan.isNoOp
        ) {
          return;
        }

        setPendingManualFolderDropPlan(nextManualFolderDropPlan);

        if (nextManualFolderDropPlan.movedAcrossParents) {
          await moveFolder(folderPath, nextManualFolderDropPlan.targetParentPath);
          await setFolderManualOrder(
            nextManualFolderDropPlan.sourceParentPath,
            nextManualFolderDropPlan.sourceOrder ?? [],
          );
        }

        await setFolderManualOrder(
          nextManualFolderDropPlan.targetParentPath,
          nextManualFolderDropPlan.targetOrder,
        );

        if (
          nextManualFolderDropPlan.movedAcrossParents &&
          nextManualFolderDropPlan.targetParentPath
        ) {
          window.dispatchEvent(
            new CustomEvent("expand-folder", {
              detail: nextManualFolderDropPlan.targetParentPath,
            }),
          );
        }
        setPendingManualFolderDropPlan(null);
        return;
      }

      if (activeData.type === "folder") {
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

        await moveFolder(folderPath, targetFolder);
        if (targetFolder) {
          window.dispatchEvent(
            new CustomEvent("expand-folder", { detail: targetFolder }),
          );
        }
      }
    } catch (error) {
      console.error("Failed to move item:", error);
      setPendingManualFolderDropPlan(null);
    }
  }, [
    clearDragState,
    manualFolderDropPlan,
    moveFolder,
    moveNote,
    setPendingManualFolderDropPlan,
    setFolderManualOrder,
  ]);

  const foldersVisible = paneMode === 3;
  const notesVisible = paneMode >= 2;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onDragCancel={clearDragState}
    >
      <div className={cn("h-full flex shrink-0", isResizing && "select-none")}>
        <div
          className={cn(
            "h-full shrink-0 overflow-hidden",
            !isResizing && "transition-[width,opacity,transform] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
            foldersVisible
              ? "opacity-100 translate-x-0"
              : "w-0 opacity-0 -translate-x-3 pointer-events-none",
          )}
          style={foldersVisible ? { width: liveWidths.folders } : undefined}
        >
          <FoldersPane
            onOpenSettings={onOpenSettings}
            dragDelta={dragDelta}
            onManualFolderDropPlanChange={setManualFolderDropPlan}
            pendingManualFolderDropPlan={pendingManualFolderDropPlan}
          />
        </div>

        {foldersVisible && notesVisible && (
          <div
            className="relative w-1 shrink-0 cursor-col-resize group z-10"
            onMouseDown={(e) => startResize(e, "folders")}
          >
            <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent group-hover:bg-border transition-colors duration-150" />
            <div className="absolute left-0 right-0 h-px bg-border/80" style={{ top: "calc(var(--ui-drag-region-height) + var(--ui-pane-header-height) - 1px)" }} />
          </div>
        )}

        <div
          className={cn(
            "h-full shrink-0 overflow-hidden",
            !isResizing && "transition-[width,opacity,transform] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
            notesVisible
              ? "opacity-100 translate-x-0"
              : "w-0 opacity-0 -translate-x-3 pointer-events-none",
          )}
          style={notesVisible ? { width: liveWidths.notes } : undefined}
        >
          <NotesPane />
        </div>

        {notesVisible && (
          <div
            className="relative w-1 shrink-0 cursor-col-resize group z-10"
            onMouseDown={(e) => startResize(e, "notes")}
          >
            <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent group-hover:bg-border transition-colors duration-150" />
            <div className="absolute left-0 right-0 h-px bg-border/80" style={{ top: "calc(var(--ui-drag-region-height) + var(--ui-pane-header-height) - 1px)" }} />
          </div>
        )}
      </div>

      <DragOverlay
        dropAnimation={null}
        style={{ width: "max-content", height: "max-content" }}
      >
        {dragLabel && (
          <div className="flex items-center gap-2 rounded-md border border-border/80 bg-bg-secondary/95 px-2.5 py-1.5 text-sm leading-none text-text shadow-lg backdrop-blur-sm">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-visible text-text/70">
              {dragType === "folder" ? (
                <FolderGlyph
                  iconName={getFolderIconName(folderIcons, dragFolderPath)}
                  className="w-4.25 h-4.25 shrink-0"
                  strokeWidth={1.75}
                />
              ) : (
                <NoteIcon className="w-4 h-4 stroke-[1.6] opacity-50 shrink-0" />
              )}
            </span>
            <span className="block truncate">{dragLabel}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

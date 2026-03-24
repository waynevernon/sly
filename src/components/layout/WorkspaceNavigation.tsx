import { useCallback, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { PaneMode } from "../../types/note";
import { useNotes } from "../../context/NotesContext";
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
  const { moveFolder, moveNote, folderIcons } = useNotes();
  const [dragLabel, setDragLabel] = useState<string | null>(null);
  const [dragType, setDragType] = useState<"folder" | "note" | null>(null);
  const [dragFolderPath, setDragFolderPath] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
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

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    setDragLabel(null);
    setDragType(null);
    setDragFolderPath(null);

    const { active, over } = event;
    if (!over) return;

    const activeData = active.data.current;
    const overData = over.data.current;
    if (!activeData || !overData) return;

    const targetFolder = (overData.path as string) || "";

    try {
      if (activeData.type === "note") {
        const noteId = activeData.id as string;
        const noteParent = noteId.includes("/")
          ? noteId.substring(0, noteId.lastIndexOf("/"))
          : "";
        if (noteParent === targetFolder) return;
        await moveNote(noteId, targetFolder);
      } else if (activeData.type === "folder") {
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
      }

      if (targetFolder) {
        window.dispatchEvent(
          new CustomEvent("expand-folder", { detail: targetFolder }),
        );
      }
    } catch (error) {
      console.error("Failed to move item:", error);
    }
  }, [moveFolder, moveNote]);

  const foldersVisible = paneMode === 3;
  const notesVisible = paneMode >= 2;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        setDragLabel(null);
        setDragType(null);
        setDragFolderPath(null);
      }}
    >
      <div className="h-full flex shrink-0">
        <div
          className={cn(
            "h-full shrink-0 overflow-hidden transition-[width,opacity,transform] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
            foldersVisible
              ? "w-[15rem] opacity-100 translate-x-0"
              : "w-0 opacity-0 -translate-x-3 pointer-events-none",
          )}
        >
          <FoldersPane />
        </div>

        <div
          className={cn(
            "h-full shrink-0 overflow-hidden transition-[width,opacity,transform] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
            notesVisible
              ? "w-[19rem] opacity-100 translate-x-0"
              : "w-0 opacity-0 -translate-x-3 pointer-events-none",
          )}
        >
          <NotesPane onOpenSettings={onOpenSettings} />
        </div>
      </div>

      <DragOverlay>
        {dragLabel && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-bg border border-border rounded-md shadow-lg text-sm text-text">
            {dragType === "folder" ? (
              <FolderGlyph
                iconName={getFolderIconName(folderIcons, dragFolderPath)}
                className="w-3.5 h-3.5 text-text/70 shrink-0"
                strokeWidth={1.75}
              />
            ) : (
              <NoteIcon className="w-3.5 h-3.5 stroke-[1.6] opacity-50 shrink-0" />
            )}
            {dragLabel}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

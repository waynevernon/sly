import { useRef } from "react";
import { ArrowDownAZ, ArrowUpAZ, CheckSquare, FileText } from "lucide-react";
import { useNotes } from "../../context/NotesContext";
import type { FolderSortMode } from "../../types/note";
import { FolderPlusIcon } from "../icons";
import { IconButton } from "../ui";
import { FolderTreeView } from "../notes/FolderTreeView";
import { Footer } from "./Footer";
import { SortMenuButton, type SortMenuItem } from "./SortMenuButton";
import { FolderFilterMenu } from "./FolderFilterMenu";

const folderSortItems: SortMenuItem<FolderSortMode>[] = [{
  key: "name",
  label: "Name",
  isActive: (value) => value === "nameAsc" || value === "nameDesc",
  getNextValue: (value) =>
    value === "nameAsc"
      ? "nameDesc"
      : value === "nameDesc"
        ? "nameAsc"
        : "nameAsc",
  renderIcon: (value, isActive) => {
    const isDescending = value === "nameDesc";
    const Icon = isActive && isDescending ? ArrowUpAZ : ArrowDownAZ;
    return <Icon className="w-4 h-4 stroke-[1.6]" />;
  },
}];

interface FoldersPaneProps {
  onOpenSettings?: () => void;
  pendingFolderPath?: string | null;
  onShowNotes?: () => void;
  onShowTasks?: () => void;
}

export function FoldersPane({
  onOpenSettings,
  pendingFolderPath = null,
  onShowNotes,
  onShowTasks,
}: FoldersPaneProps) {
  const {
    folderSortMode,
    settings,
    setFolderSortMode,
  } = useNotes();
  const tasksEnabled = settings?.tasksEnabled ?? false;
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  return (
    <div className="h-full bg-bg-secondary flex flex-col select-none">
      <div className="ui-pane-drag-region" data-tauri-drag-region></div>
      <div className="ui-pane-header border-border/80">
        {tasksEnabled && onShowNotes && onShowTasks ? (
          <div className="flex items-center gap-1 min-w-0 -ml-2">
            <button
              type="button"
              aria-pressed={true}
              onClick={onShowNotes}
              className="ui-focus-ring flex shrink-0 items-center gap-1.5 rounded-[var(--ui-radius-md)] font-medium text-base text-text bg-bg-muted px-2 h-[var(--ui-control-height-compact)] outline-none"
            >
              <FileText className="h-4 w-4 shrink-0 stroke-[1.7]" />
              Notes
            </button>
            <button
              type="button"
              aria-pressed={false}
              onClick={onShowTasks}
              title="Tasks"
              className="ui-focus-ring flex items-center h-[var(--ui-control-height-compact)] px-2 rounded-[var(--ui-radius-md)] text-text-muted transition-colors hover:bg-bg-muted hover:text-text outline-none"
            >
              <CheckSquare className="h-4 w-4 shrink-0 stroke-[1.7]" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 min-w-0">
            <FileText className="h-4.5 w-4.5 shrink-0 text-text-muted/80 stroke-[1.7]" />
            <div className="min-w-0 truncate font-medium text-base text-text">Notes</div>
          </div>
        )}
        <div className="ui-pane-header-actions">
          <FolderFilterMenu />
          <SortMenuButton
            title="Sort folders"
            value={folderSortMode}
            items={folderSortItems}
            onChange={(nextMode) => {
              void setFolderSortMode(nextMode);
            }}
          />
          <IconButton
            variant="ghost"
            title="New folder"
            onClick={() => {
              window.dispatchEvent(new CustomEvent("create-new-folder"));
            }}
          >
            <FolderPlusIcon className="w-4.75 h-4.75 stroke-[1.5]" />
          </IconButton>
        </div>
      </div>

      <div
        ref={scrollContainerRef}
        className="ui-scrollbar-overlay flex-1 overflow-y-auto py-2.5"
      >
        <FolderTreeView pendingFolderPath={pendingFolderPath} />
      </div>

      <Footer onOpenSettings={onOpenSettings} />
    </div>
  );
}

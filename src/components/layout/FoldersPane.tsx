import { useNotes } from "../../context/NotesContext";
import type { FolderSortMode } from "../../types/note";
import { FolderPlusIcon } from "../icons";
import { IconButton } from "../ui";
import { FolderTreeView } from "../notes/FolderTreeView";
import { Footer } from "./Footer";
import { SortMenuButton } from "./SortMenuButton";

const folderSortOptions: { value: FolderSortMode; label: string }[] = [
  { value: "manual", label: "Manual" },
  { value: "nameAsc", label: "Name (A-Z)" },
  { value: "nameDesc", label: "Name (Z-A)" },
];

interface FoldersPaneProps {
  onOpenSettings?: () => void;
}

export function FoldersPane({ onOpenSettings }: FoldersPaneProps) {
  const { folderSortMode, setFolderSortMode } = useNotes();

  return (
    <div className="h-full bg-bg-secondary border-r border-border/80 flex flex-col select-none">
      <div className="ui-pane-drag-region" data-tauri-drag-region></div>
      <div className="ui-pane-header border-border/80">
        <div className="font-medium text-base text-text">Folders</div>
        <div className="ui-pane-header-actions">
          <SortMenuButton
            title="Sort Folders"
            value={folderSortMode}
            options={folderSortOptions}
            onChange={(nextMode) => {
              void setFolderSortMode(nextMode);
            }}
          />
          <IconButton
            variant="ghost"
            title="New Folder"
            onClick={() => {
              window.dispatchEvent(new CustomEvent("create-new-folder"));
            }}
          >
            <FolderPlusIcon className="w-4.75 h-4.75 stroke-[1.5]" />
          </IconButton>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-2.5">
        <FolderTreeView />
      </div>

      <Footer onOpenSettings={onOpenSettings} />
    </div>
  );
}

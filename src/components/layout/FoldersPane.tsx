import { FolderPlusIcon } from "../icons";
import { IconButton } from "../ui";
import { FolderTreeView } from "../notes/FolderTreeView";

export function FoldersPane() {
  return (
    <div className="h-full bg-bg-secondary border-r border-border/80 flex flex-col select-none">
      <div className="h-11 shrink-0" data-tauri-drag-region></div>
      <div className="flex items-center justify-between pl-4 pr-3 pb-2 border-b border-border/80 shrink-0">
        <div className="font-medium text-base text-text">Folders</div>
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

      <div className="flex-1 overflow-y-auto py-2">
        <FolderTreeView />
      </div>
    </div>
  );
}

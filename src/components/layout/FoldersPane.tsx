import { useRef } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ArrowDownAZ, ArrowUpAZ, GripVertical } from "lucide-react";
import { useNotes } from "../../context/NotesContext";
import type { FolderSortMode } from "../../types/note";
import { FolderPlusIcon } from "../icons";
import {
  IconButton,
  menuItemClassName,
  menuLabelClassName,
  menuSeparatorClassName,
} from "../ui";
import { FolderTreeView } from "../notes/FolderTreeView";
import { Footer } from "./Footer";
import { SortMenuButton, type SortMenuItem } from "./SortMenuButton";
import type { FolderDropOrderPlan } from "../../lib/folderTree";

const folderSortItems: SortMenuItem<FolderSortMode>[] = [
  {
    key: "manual",
    label: "Manual",
    isActive: (value) => value === "manual",
    getNextValue: (value) => (value === "manual" ? value : "manual"),
    renderIcon: () => <GripVertical className="w-4 h-4 stroke-[1.6]" />,
  },
  {
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
      const Icon =
        isActive && isDescending ? ArrowUpAZ : ArrowDownAZ;
      return <Icon className="w-4 h-4 stroke-[1.6]" />;
    },
  },
];

interface FoldersPaneProps {
  onOpenSettings?: () => void;
  dragDelta: { x: number; y: number } | null;
  onManualFolderDropPlanChange?: (plan: FolderDropOrderPlan | null) => void;
  pendingManualFolderDropPlan?: FolderDropOrderPlan | null;
}

export function FoldersPane({
  onOpenSettings,
  dragDelta,
  onManualFolderDropPlanChange,
  pendingManualFolderDropPlan,
}: FoldersPaneProps) {
  const {
    folderSortMode,
    showRecentNotes,
    setFolderSortMode,
    setShowRecentNotes,
  } = useNotes();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  return (
    <div className="h-full bg-bg-secondary border-r border-border/80 flex flex-col select-none">
      <div className="ui-pane-drag-region" data-tauri-drag-region></div>
      <div className="ui-pane-header border-border/80">
        <div className="font-medium text-base text-text">Folders</div>
        <div className="ui-pane-header-actions">
          <SortMenuButton
            title="Sort Folders"
            value={folderSortMode}
            items={folderSortItems}
            onChange={(nextMode) => {
              void setFolderSortMode(nextMode);
            }}
          >
            <DropdownMenu.Separator className={menuSeparatorClassName} />
            <DropdownMenu.Label className={menuLabelClassName}>
              View
            </DropdownMenu.Label>
            <DropdownMenu.Separator className={menuSeparatorClassName} />
            <DropdownMenu.CheckboxItem
              checked={showRecentNotes}
              className={menuItemClassName}
              onCheckedChange={(checked) => {
                void setShowRecentNotes(checked === true);
              }}
            >
              <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-text">
                <DropdownMenu.ItemIndicator>
                  <span className="text-xs leading-none">✓</span>
                </DropdownMenu.ItemIndicator>
              </span>
              <span>Recent Notes</span>
            </DropdownMenu.CheckboxItem>
          </SortMenuButton>
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

      <div
        ref={scrollContainerRef}
        className="ui-scrollbar-overlay flex-1 overflow-y-auto py-2.5"
      >
        <FolderTreeView
          dragDelta={dragDelta}
          onManualFolderDropPlanChange={onManualFolderDropPlanChange}
          pendingManualFolderDropPlan={pendingManualFolderDropPlan}
        />
      </div>

      <Footer onOpenSettings={onOpenSettings} />
    </div>
  );
}

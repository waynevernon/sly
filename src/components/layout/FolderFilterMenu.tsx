import { useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ListFilter } from "lucide-react";
import { useNotes } from "../../context/NotesContext";
import {
  IconButton,
  TooltipContent,
  TooltipRoot,
  TooltipTrigger,
  menuItemClassName,
  menuLabelClassName,
  menuSeparatorClassName,
  menuSurfaceClassName,
} from "../ui";

export function FolderFilterMenu() {
  const {
    showPinnedNotes,
    showRecentNotes,
    showNoteCounts,
    setShowPinnedNotes,
    setShowRecentNotes,
    setNoteListViewOptions,
  } = useNotes();

  const [menuOpen, setMenuOpen] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [suppressTooltip, setSuppressTooltip] = useState(false);

  return (
    <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
      <TooltipRoot
        open={tooltipOpen && !menuOpen && !suppressTooltip}
        onOpenChange={(open) => {
          if (suppressTooltip) {
            setTooltipOpen(false);
            return;
          }
          setTooltipOpen(open);
        }}
        delayDuration={200}
      >
        <TooltipTrigger asChild>
          <DropdownMenu.Trigger asChild>
            <IconButton
              aria-label="Folder view options"
              onPointerDown={() => {
                setTooltipOpen(false);
                setSuppressTooltip(true);
              }}
              onPointerLeave={() => {
                setTooltipOpen(false);
                setSuppressTooltip(false);
              }}
              onBlur={() => {
                setTooltipOpen(false);
                setSuppressTooltip(false);
              }}
            >
              <ListFilter className="w-4.25 h-4.25 stroke-[1.5]" />
            </IconButton>
          </DropdownMenu.Trigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">Folder view options</TooltipContent>
      </TooltipRoot>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="bottom"
          sideOffset={8}
          align="start"
          avoidCollisions={false}
          onCloseAutoFocus={(event) => {
            setTooltipOpen(false);
            event.preventDefault();
          }}
          className={`${menuSurfaceClassName} min-w-52 z-50`}
        >
          <DropdownMenu.Label className={menuLabelClassName}>
            Sections
          </DropdownMenu.Label>
          <DropdownMenu.Separator className={menuSeparatorClassName} />
          <div className="flex flex-col gap-1">
            <DropdownMenu.CheckboxItem
              checked={showPinnedNotes}
              className={menuItemClassName}
              onCheckedChange={(checked) => {
                void setShowPinnedNotes(checked === true);
              }}
            >
              <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-text">
                <DropdownMenu.ItemIndicator>
                  <Check className="h-3 w-3 stroke-[2.2]" />
                </DropdownMenu.ItemIndicator>
              </span>
              <span>Pinned</span>
            </DropdownMenu.CheckboxItem>
            <DropdownMenu.CheckboxItem
              checked={showRecentNotes}
              className={menuItemClassName}
              onCheckedChange={(checked) => {
                void setShowRecentNotes(checked === true);
              }}
            >
              <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-text">
                <DropdownMenu.ItemIndicator>
                  <Check className="h-3 w-3 stroke-[2.2]" />
                </DropdownMenu.ItemIndicator>
              </span>
              <span>Recent</span>
            </DropdownMenu.CheckboxItem>
          </div>
          <DropdownMenu.Separator className={menuSeparatorClassName} />
          <DropdownMenu.Label className={menuLabelClassName}>
            Display
          </DropdownMenu.Label>
          <DropdownMenu.Separator className={menuSeparatorClassName} />
          <div className="flex flex-col gap-1">
            <DropdownMenu.CheckboxItem
              checked={showNoteCounts}
              className={menuItemClassName}
              onCheckedChange={(checked) => {
                void setNoteListViewOptions({ showNoteCounts: checked === true });
              }}
            >
              <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-text">
                <DropdownMenu.ItemIndicator>
                  <Check className="h-3 w-3 stroke-[2.2]" />
                </DropdownMenu.ItemIndicator>
              </span>
              <span>Note Count</span>
            </DropdownMenu.CheckboxItem>
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

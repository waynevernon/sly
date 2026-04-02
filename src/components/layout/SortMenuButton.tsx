import { useState, type ReactNode } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ListFilter } from "lucide-react";
import { cn } from "../../lib/utils";
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

export interface SortMenuItem<T extends string> {
  key: string;
  label: string;
  isActive: (value: T) => boolean;
  getNextValue: (value: T) => T;
  renderIcon: (value: T, isActive: boolean) => ReactNode;
}

interface SortMenuButtonProps<T extends string> {
  title: string;
  menuTitle?: string;
  showMenuHeader?: boolean;
  value: T;
  items: SortMenuItem<T>[];
  onChange: (value: T) => void;
  children?: ReactNode;
}

export function SortMenuButton<T extends string>({
  title,
  menuTitle,
  showMenuHeader = true,
  value,
  items,
  onChange,
  children,
}: SortMenuButtonProps<T>) {
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
              aria-label={title}
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
        <TooltipContent side="bottom">{title}</TooltipContent>
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
          {showMenuHeader && (
            <DropdownMenu.Label className={menuLabelClassName}>
              {menuTitle ?? title}
            </DropdownMenu.Label>
          )}
          {items.length > 0 && (
            <>
              {showMenuHeader && (
                <DropdownMenu.Separator className={menuSeparatorClassName} />
              )}
              <div className="flex flex-col gap-1">
                {items.map((item) => {
                  const isActive = item.isActive(value);
                  return (
                    <DropdownMenu.Item
                      key={item.key}
                      className={cn(menuItemClassName, isActive && "bg-bg-muted")}
                      onSelect={() => {
                        onChange(item.getNextValue(value));
                      }}
                    >
                      <span
                        className={cn(
                          "inline-flex h-4 w-4 shrink-0 items-center justify-center",
                          isActive ? "text-text" : "text-text-muted",
                        )}
                      >
                        {item.renderIcon(value, isActive)}
                      </span>
                      {item.label}
                    </DropdownMenu.Item>
                  );
                })}
              </div>
            </>
          )}
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

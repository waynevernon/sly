import type { ReactNode } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ListFilter } from "lucide-react";
import { cn } from "../../lib/utils";
import {
  IconButton,
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
  value: T;
  items: SortMenuItem<T>[];
  onChange: (value: T) => void;
}

export function SortMenuButton<T extends string>({
  title,
  value,
  items,
  onChange,
}: SortMenuButtonProps<T>) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <IconButton title={title}>
          <ListFilter className="w-4.25 h-4.25 stroke-[1.5]" />
        </IconButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="bottom"
          sideOffset={8}
          align="start"
          avoidCollisions={false}
          className={`${menuSurfaceClassName} min-w-52 z-50`}
        >
          <DropdownMenu.Label className={menuLabelClassName}>
            {title}
          </DropdownMenu.Label>
          <DropdownMenu.Separator className={menuSeparatorClassName} />
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
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

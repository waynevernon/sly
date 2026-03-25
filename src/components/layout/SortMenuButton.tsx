import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ArrowDownWideNarrow } from "lucide-react";
import { CheckIcon } from "../icons";
import {
  IconButton,
  menuItemClassName,
  menuLabelClassName,
  menuSeparatorClassName,
  menuSurfaceClassName,
} from "../ui";

interface SortOption<T extends string> {
  value: T;
  label: string;
}

interface SortMenuButtonProps<T extends string> {
  title: string;
  value: T;
  options: SortOption<T>[];
  onChange: (value: T) => void;
}

export function SortMenuButton<T extends string>({
  title,
  value,
  options,
  onChange,
}: SortMenuButtonProps<T>) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <IconButton title={title}>
          <ArrowDownWideNarrow className="w-4.25 h-4.25 stroke-[1.5]" />
        </IconButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          sideOffset={8}
          align="end"
          collisionPadding={8}
          className={`${menuSurfaceClassName} min-w-52 z-50`}
        >
          <DropdownMenu.Label className={menuLabelClassName}>
            {title}
          </DropdownMenu.Label>
          <DropdownMenu.Separator className={menuSeparatorClassName} />
          <DropdownMenu.RadioGroup
            value={value}
            onValueChange={(nextValue) => onChange(nextValue as T)}
          >
            {options.map((option) => (
              <DropdownMenu.RadioItem
                key={option.value}
                value={option.value}
                className={menuItemClassName}
              >
                <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-text-muted">
                  <DropdownMenu.ItemIndicator>
                    <CheckIcon className="w-4 h-4 stroke-[1.8]" />
                  </DropdownMenu.ItemIndicator>
                </span>
                {option.label}
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

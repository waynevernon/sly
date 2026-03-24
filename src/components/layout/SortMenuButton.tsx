import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { CheckIcon, ListOrderedIcon } from "../icons";
import { IconButton } from "../ui";

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

const contentClassName =
  "min-w-52 rounded-md border border-border bg-bg p-1 shadow-lg z-50";
const labelClassName = "px-2.5 py-1 text-xs font-medium text-text-muted";
const separatorClassName = "my-1 h-px bg-border";
const itemClassName =
  "relative flex cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2.5 text-sm text-text outline-none hover:bg-bg-muted focus:bg-bg-muted";

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
          <ListOrderedIcon className="w-4.25 h-4.25 stroke-[1.5]" />
        </IconButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          sideOffset={8}
          align="end"
          className={contentClassName}
        >
          <DropdownMenu.Label className={labelClassName}>
            {title}
          </DropdownMenu.Label>
          <DropdownMenu.Separator className={separatorClassName} />
          <DropdownMenu.RadioGroup
            value={value}
            onValueChange={(nextValue) => onChange(nextValue as T)}
          >
            {options.map((option) => (
              <DropdownMenu.RadioItem
                key={option.value}
                value={option.value}
                className={itemClassName}
              >
                <span className="absolute left-2.5 inline-flex h-4 w-4 items-center justify-center text-text-muted">
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

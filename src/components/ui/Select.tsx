import * as React from "react";
import { cn } from "../../lib/utils";
import { ChevronDownIcon } from "../icons";

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div className="relative">
        <select
          className={cn(
            "ui-focus-ring h-[var(--ui-control-height-standard)] w-full rounded-[var(--ui-radius-md)] border border-border bg-bg px-3 text-sm text-text",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "[&>option]:bg-bg [&>option]:text-text",
            "appearance-none pr-8",
            className
          )}
          ref={ref}
          {...props}
        >
          {children}
        </select>
        <ChevronDownIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 stroke-[1.7] text-text-muted pointer-events-none" />
      </div>
    );
  }
);
Select.displayName = "Select";

export { Select };

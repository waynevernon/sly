import * as React from "react";
import { cn } from "../../lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "ui-focus-ring flex h-[var(--ui-control-height-standard)] w-full rounded-[var(--ui-radius-md)] border border-border bg-bg px-3 text-sm text-text",
          "ring-offset-bg file:border-0 file:bg-transparent file:text-sm file:font-medium",
          "placeholder:text-text-muted",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };

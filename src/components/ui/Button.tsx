import * as React from "react";
import { cn } from "../../lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | "primary"
    | "default"
    | "secondary"
    | "ghost"
    | "outline"
    | "link"
    | "destructive";
  size?: "xs" | "sm" | "md" | "lg" | "xl";
}

const buttonSizes = {
  xs: "h-[var(--ui-control-height-compact)] px-2.5 text-xs",
  sm: "h-[var(--ui-control-height-standard)] px-3 text-sm",
  md: "h-[var(--ui-control-height-standard)] px-3 text-sm",
  lg: "h-9 px-4", // 36px
  xl: "h-[var(--ui-control-height-prominent)] px-5",
};

const buttonVariants = {
  primary: "bg-accent text-text-inverse hover:bg-accent/90",
  default: "bg-bg-muted text-text hover:bg-bg-emphasis",
  secondary: "bg-bg-muted text-text hover:bg-bg-emphasis",
  ghost: "hover:bg-bg-muted text-text-muted hover:text-text",
  outline:
    "border border-border bg-transparent hover:bg-bg-muted text-text",
  link: "text-text-muted hover:text-text underline-offset-4 hover:underline",
  destructive:
    "bg-[var(--color-danger-muted)] text-[var(--color-danger)] hover:bg-[var(--color-danger-muted)]/90",
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "md", ...props }, ref) => {
    return (
      <button
        className={cn(
          "ui-focus-ring inline-flex items-center justify-center whitespace-nowrap rounded-[var(--ui-radius-md)] font-medium transition-colors",
          "disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
          buttonSizes[size],
          buttonVariants[variant],
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };

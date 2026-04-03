export type ButtonVariant =
  | "primary"
  | "default"
  | "secondary"
  | "ghost"
  | "outline"
  | "link"
  | "destructive";

export type ButtonSize = "xs" | "sm" | "md" | "lg" | "xl";

export const buttonSizeClasses: Record<ButtonSize, string> = {
  xs: "h-[var(--ui-control-height-compact)] px-2.5 text-xs",
  sm: "h-[var(--ui-control-height-standard)] px-3 text-sm",
  md: "h-[var(--ui-control-height-standard)] px-3 text-sm",
  lg: "h-9 px-4", // 36px
  xl: "h-[var(--ui-control-height-prominent)] px-5",
};

export const iconButtonSizeClasses: Record<ButtonSize, string> = {
  xs: "w-[var(--ui-control-height-compact)] h-[var(--ui-control-height-compact)]",
  sm: "w-[var(--ui-control-height-compact)] h-[var(--ui-control-height-compact)]",
  md: "w-[var(--ui-control-height-standard)] h-[var(--ui-control-height-standard)]",
  lg: "w-9 h-9", // 36px
  xl: "w-[var(--ui-control-height-prominent)] h-[var(--ui-control-height-prominent)]",
};

export const buttonVariantClasses: Record<ButtonVariant, string> = {
  primary: "bg-accent text-text-inverse hover:bg-accent/90",
  default: "bg-bg-muted text-text hover:bg-bg-emphasis",
  secondary: "bg-bg-muted text-text hover:bg-bg-emphasis",
  ghost: "hover:bg-bg-muted text-text-muted hover:text-text",
  outline: "border border-border bg-transparent text-text hover:bg-bg-muted",
  link: "text-text-muted underline-offset-4 hover:text-text hover:underline",
  destructive:
    "bg-[var(--color-danger-muted)] text-[var(--color-danger)] hover:bg-[var(--color-danger-muted)]/90",
};

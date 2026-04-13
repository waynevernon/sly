import * as React from "react";
import { type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Tooltip } from "./Tooltip";
import { PinIcon } from "../icons";
import {
  buttonVariantClasses,
  iconButtonSizeClasses,
  type ButtonSize,
  type ButtonVariant,
} from "./buttonStyles";

// Re-export components
export {
  Tooltip,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
  TooltipContent,
} from "./Tooltip";
export { Button } from "./Button";
export { Checkbox } from "./Checkbox";
export { CodeCopyButton } from "./CodeCopyButton";
export { CountBadge, type CountBadgeProps } from "./CountBadge";
export { Input } from "./Input";
export { InlineNameEditor } from "./InlineNameEditor";
export { LoadingSpinner } from "./LoadingSpinner";
export { Select } from "./Select";
export { Toaster } from "./Toaster";
export { DialogShell } from "./DialogShell";
export { PanelEmptyState } from "./PanelEmptyState";
export { PopoverSurface } from "./PopoverSurface";
export { StatusPanel } from "./StatusPanel";
export {
  MenuSurface,
  menuSurfaceClassName,
  menuLabelClassName,
  menuSeparatorClassName,
  menuItemClassName,
  destructiveMenuItemClassName,
} from "./MenuSurface";
export {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "./AlertDialog";

// Toolbar button with active state and tooltip
interface ToolbarButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  isActive?: boolean;
  children: ReactNode;
}

export function ToolbarButton({
  isActive = false,
  className = "",
  children,
  title,
  ...props
}: ToolbarButtonProps) {
  const button = (
    <button
      className={cn(
        "ui-focus-ring h-[var(--ui-control-height-compact)] w-[var(--ui-control-height-compact)] flex items-center justify-center rounded-[var(--ui-radius-md)] text-sm transition-colors shrink-0",
        isActive
          ? "bg-bg-muted text-text"
          : "hover:bg-bg-muted hover:text-text text-text-muted",
        className
      )}
      aria-label={title}
      {...props}
    >
      {children}
    </button>
  );

  if (title) {
    return <Tooltip content={title}>{button}</Tooltip>;
  }

  return button;
}

// Icon button (for sidebar actions, etc.)
export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  size?: ButtonSize;
  variant?: Exclude<ButtonVariant, "link">;
  title?: string;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    { className, children, title, size = "sm", variant = "ghost", ...props },
    ref
  ) => {
    const button = (
      <button
        ref={ref}
        className={cn(
          "ui-focus-ring flex items-center justify-center rounded-[var(--ui-radius-md)] transition-colors",
          "disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
          iconButtonSizeClasses[size],
          buttonVariantClasses[variant],
          className
        )}
        aria-label={title}
        {...props}
      >
        {children}
      </button>
    );

    if (title) {
      return <Tooltip content={title}>{button}</Tooltip>;
    }

    return button;
  }
);
IconButton.displayName = "IconButton";

// List item for sidebar
interface ListItemProps {
  title: string;
  subtitlePrefix?: string;
  subtitle?: string;
  subtitleLines?: 1 | 2 | 3;
  meta?: string;
  secondaryOrder?: "meta-first" | "subtitle-first";
  selectionState?: "none" | "selected" | "active";
  isPinned?: boolean;
  className?: string;
  /** Optional status icon to display next to meta */
}

export function ListItem({
  title,
  subtitlePrefix,
  subtitle,
  subtitleLines = 1,
  meta,
  secondaryOrder = "meta-first",
  selectionState = "none",
  isPinned = false,
  className,
}: ListItemProps) {
  const cleanSubtitlePrefix = subtitlePrefix
    ?.replace(/&nbsp;/g, " ")
    .replace(/\u00A0/g, " ")
    .trim();
  const hasSubtitlePrefix = Boolean(cleanSubtitlePrefix);
  // Clean subtitle: treat whitespace-only or &nbsp; as empty
  const cleanSubtitle = subtitle
    ?.replace(/&nbsp;/g, " ")
    .replace(/\u00A0/g, " ")
    .trim();
  const hasSubtitle = cleanSubtitle && cleanSubtitle.length > 0;
  const cleanMeta = meta?.trim();
  const hasMeta = Boolean(cleanMeta);
  const hasSecondaryRow = hasMeta || hasSubtitlePrefix || Boolean(hasSubtitle);
  const subtitleLineClampClass =
    subtitleLines === 3
      ? "line-clamp-3"
      : subtitleLines === 2
        ? "line-clamp-2"
        : "line-clamp-1";
  const isActive = selectionState === "active";
  const isSelected = selectionState !== "none";
  const inlineSubtitle = hasSubtitlePrefix
    ? hasSubtitle
      ? `${cleanSubtitlePrefix} · ${cleanSubtitle}`
      : cleanSubtitlePrefix
    : cleanSubtitle;

  return (
    <div
      className={cn(
        "w-full text-left px-2.5 transition-colors cursor-pointer select-none rounded-md",
        "focus:outline-none focus-visible:outline-none",
        hasSecondaryRow ? "py-2.25" : "py-1.75",
        isActive
          ? "bg-bg-emphasis"
          : selectionState === "selected"
            ? "bg-bg-muted/75 hover:bg-bg-muted"
            : "hover:bg-bg-muted",
        className
      )}
    >
      <div className="flex items-center gap-1 min-w-0">
        {isPinned && (
          <PinIcon className="w-4.25 h-4.25 stroke-[1.6] fill-current text-text-muted shrink-0" />
        )}
        <span className={cn("text-sm font-medium truncate text-text")}>
          {title}
        </span>
      </div>
      {hasSecondaryRow &&
        (secondaryOrder === "subtitle-first" ? (
          <div className="mt-0.5 flex min-w-0 w-full flex-col items-start gap-0.5">
            {(hasSubtitlePrefix || hasSubtitle) && (
              <p
                className={cn(
                  "text-xs min-w-0 w-full",
                  subtitleLineClampClass,
                  "text-text",
                  isSelected ? "opacity-90" : "opacity-75"
                )}
              >
                {inlineSubtitle}
              </p>
            )}
            {hasMeta && (
              <div
                className={cn(
                  "text-xs truncate max-w-full",
                  "text-text-muted",
                  isSelected ? "opacity-80" : "opacity-60"
                )}
              >
                {cleanMeta}
              </div>
            )}
          </div>
        ) : (
          <div
            className={cn(
              "min-w-0 w-full",
              subtitleLines > 1
                ? "flex items-start gap-1"
                : "flex items-center gap-1",
            )}
          >
            {hasMeta && (
              <div
                className={cn(
                  "text-xs whitespace-nowrap shrink-0 truncate",
                  isSelected ? "text-text" : "text-text-muted"
                )}
              >
                {cleanMeta}
              </div>
            )}
            {(hasSubtitlePrefix || hasSubtitle) && (
              <p
                className={cn(
                  "text-xs min-w-0 flex-1",
                  subtitleLineClampClass,
                  "text-text-muted",
                  isSelected ? "opacity-100" : "opacity-70"
                )}
              >
                {inlineSubtitle}
              </p>
            )}
          </div>
        ))}
    </div>
  );
}

// Command palette item
interface CommandItemProps {
  label: string;
  subtitle?: string;
  shortcut?: string;
  icon?: ReactNode;
  iconText?: string;
  variant?: "note" | "command";
  isSelected?: boolean;
  onClick?: () => void;
}

export function CommandItem({
  label,
  subtitle,
  shortcut,
  icon,
  iconText,
  variant = "command",
  isSelected = false,
  onClick,
}: CommandItemProps) {
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={-1}
      className={cn(
        "w-full text-left px-3 py-2 rounded-lg flex items-center justify-between transition-colors cursor-pointer",
        isSelected ? "bg-bg-muted text-text" : "text-text hover:bg-bg-muted"
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        {(icon || iconText) && (
          <div
            className={cn(
              "shrink-0 flex items-center justify-center text-text-muted",
              variant === "note" &&
                "w-9 h-9 rounded-md bg-bg-emphasis flex items-center justify-center"
            )}
          >
            {iconText ? (
              <span className="text-xl text-text-muted font-sans">
                {iconText}
              </span>
            ) : (
              icon
            )}
          </div>
        )}
        <div className="flex flex-col min-w-0">
          <span className="text-[15px] font-medium truncate">{label}</span>
          {subtitle && (
            <span className="text-sm truncate text-text-muted">{subtitle}</span>
          )}
        </div>
      </div>
      {shortcut && (
        <kbd
          className={cn(
            "text-xs px-2 py-0.5 rounded-md ml-2",
            isSelected ? "bg-bg-muted text-text" : "bg-bg-muted text-text-muted"
          )}
        >
          {shortcut}
        </kbd>
      )}
    </div>
  );
}

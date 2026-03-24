import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/utils";

export const dialogOverlayClassName = "ui-dialog-overlay";
export const dialogPanelClassName =
  "ui-surface-dialog overflow-hidden";

interface DialogShellProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  onBackdropClick?: () => void;
  overlayClassName?: string;
  panelClassName?: string;
}

export function DialogShell({
  children,
  className,
  onBackdropClick,
  overlayClassName,
  panelClassName,
  ...props
}: DialogShellProps) {
  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center px-4 py-11 pointer-events-none",
        className,
      )}
      {...props}
    >
      <div
        className={cn(
          "absolute inset-0 animate-fade-in pointer-events-auto",
          dialogOverlayClassName,
          overlayClassName,
        )}
        onClick={onBackdropClick}
      />
      <div
        className={cn(
          "relative w-full animate-slide-down pointer-events-auto",
          dialogPanelClassName,
          panelClassName,
        )}
        aria-modal="true"
        role="dialog"
      >
        {children}
      </div>
    </div>
  );
}

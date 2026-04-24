import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

interface PanelEmptyStateProps {
  icon?: ReactNode;
  title?: string;
  message?: string;
  action?: ReactNode;
  className?: string;
}

export function PanelEmptyState({
  icon,
  title,
  message,
  action,
  className,
}: PanelEmptyStateProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 select-none",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col items-center justify-center px-4 py-6 text-center">
        {icon ? (
          <div className="mb-3 shrink-0 text-text-muted [&_svg]:h-7 [&_svg]:w-7 [&_svg]:stroke-[1.6] [&_svg_*]:stroke-[1.6]">
            {icon}
          </div>
        ) : null}
        {(title || message) ? (
          <div className="w-full min-w-0 overflow-hidden">
            {title ? <h2 className="line-clamp-2 break-words text-sm font-medium text-text">{title}</h2> : null}
            {message ? (
              <p className={cn("mx-auto max-w-[14rem] break-words text-sm text-text-muted", title ? "mt-1" : "")}>
                {message}
              </p>
            ) : null}
          </div>
        ) : null}
        {action ? (
          <div className="mt-4 flex max-w-full justify-center overflow-hidden">
            {action}
          </div>
        ) : null}
      </div>
    </div>
  );
}

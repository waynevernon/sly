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
        "relative flex flex-1 select-none",
        className,
      )}
    >
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-6 text-center">
        {icon ? (
          <div className="mb-3 text-text-muted [&_svg]:h-7 [&_svg]:w-7">
            {icon}
          </div>
        ) : null}
        {title ? <h2 className="text-sm font-medium text-text">{title}</h2> : null}
        {message ? (
          <p className={cn("text-sm text-text-muted", title ? "mt-1 max-w-[24rem]" : "")}>
            {message}
          </p>
        ) : null}
      </div>
      {action ? (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 flex justify-center pt-20">
          <div className="pointer-events-auto">{action}</div>
        </div>
      ) : null}
    </div>
  );
}

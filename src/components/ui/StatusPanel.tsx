import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/utils";

type StatusTone = "warning" | "danger";

const statusToneClassName: Record<StatusTone, string> = {
  warning: "ui-status-panel-warning",
  danger: "ui-status-panel-danger",
};

interface StatusPanelProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  tone: StatusTone;
}

export function StatusPanel({
  children,
  className,
  tone,
  ...props
}: StatusPanelProps) {
  return (
    <div
      className={cn(
        "rounded-[var(--ui-radius-lg)] px-3 py-2 text-sm text-text",
        statusToneClassName[tone],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

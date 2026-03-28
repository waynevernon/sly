import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

export interface CountBadgeProps {
  count: ReactNode;
  layout?: "inline" | "column";
  tone?: "plain" | "filled";
  emphasis?: "active" | "inactive";
  className?: string;
}

const layoutClassName: Record<NonNullable<CountBadgeProps["layout"]>, string> = {
  inline: "ui-count-badge--inline",
  column: "ui-count-badge--column-layout",
};

const toneClassName: Record<NonNullable<CountBadgeProps["tone"]>, string> = {
  plain: "ui-count-badge--plain",
  filled: "ui-count-badge--filled",
};

const emphasisClassName: Record<
  NonNullable<CountBadgeProps["emphasis"]>,
  string
> = {
  active: "ui-count-badge--active",
  inactive: "ui-count-badge--inactive",
};

export function CountBadge({
  count,
  layout = "column",
  tone = "plain",
  emphasis = "active",
  className,
}: CountBadgeProps) {
  return (
    <span
      className={cn(
        "ui-count-badge",
        layoutClassName[layout],
        toneClassName[tone],
        emphasisClassName[emphasis],
        className,
      )}
    >
      {count}
    </span>
  );
}

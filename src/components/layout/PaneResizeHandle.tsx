import type { MouseEventHandler } from "react";
import { cn } from "../../lib/utils";

interface PaneResizeHandleProps {
  ariaLabel: string;
  onMouseDown: MouseEventHandler<HTMLDivElement>;
  align?: "left" | "right";
  className?: string;
}

/**
 * Vertical pane resize handle.
 *
 * The handle is an absolute overlay anchored to a pane boundary. It owns the
 * 1px separator line (so panes should not carry their own border on that edge)
 * and exposes a wider hit area without reserving layout space.
 *
 * The hit area always extends rightward from the boundary (into the pane on
 * the right). This is a deliberate, consistent rule: every pane in this app
 * keeps its vertical scrollbar on its right edge, so extending leftward would
 * overlap the owning pane's scrollbar and steal its pointer events.
 */
export function PaneResizeHandle({
  ariaLabel,
  onMouseDown,
  align = "right",
  className,
}: PaneResizeHandleProps) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      onMouseDown={onMouseDown}
      className={cn(
        "group absolute inset-y-0 z-10 w-2 cursor-col-resize",
        align === "right" ? "left-full" : "left-0",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-px bg-border/80 transition-colors duration-150 group-hover:bg-border-solid"
      />
    </div>
  );
}

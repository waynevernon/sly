import * as React from "react";
import { cn } from "../../lib/utils";

export const popoverSurfaceClassName = "ui-surface-popover";

export const PopoverSurface = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "ui-surface-popover animate-slide-down",
      className,
    )}
    {...props}
  />
));
PopoverSurface.displayName = "PopoverSurface";

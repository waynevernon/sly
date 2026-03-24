import * as React from "react";
import { cn } from "../../lib/utils";

export const menuSurfaceClassName = "ui-surface-menu";
export const menuLabelClassName = "ui-menu-label";
export const menuSeparatorClassName = "ui-menu-separator";
export const menuItemClassName = "ui-menu-item";
export const destructiveMenuItemClassName = cn(
  menuItemClassName,
  "ui-menu-item-destructive",
);

export const MenuSurface = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn(menuSurfaceClassName, className)} {...props} />
));
MenuSurface.displayName = "MenuSurface";

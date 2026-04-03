import * as React from "react";
import { cn } from "../../lib/utils";
import {
  buttonSizeClasses,
  buttonVariantClasses,
  type ButtonSize,
  type ButtonVariant,
} from "./buttonStyles";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "md", ...props }, ref) => {
    return (
      <button
        className={cn(
          "ui-focus-ring inline-flex items-center justify-center whitespace-nowrap rounded-[var(--ui-radius-md)] font-medium transition-colors",
          "disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
          buttonSizeClasses[size],
          buttonVariantClasses[variant],
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };

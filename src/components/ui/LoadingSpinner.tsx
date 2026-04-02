import { SpinnerIcon } from "../icons";
import { cn } from "../../lib/utils";

const spinnerSizeClassNames = {
  xs: "h-3 w-3",
  sm: "h-3.25 w-3.25",
  md: "h-4 w-4",
  lg: "h-4.5 w-4.5",
  xl: "h-6 w-6",
} as const;

const spinnerToneClassNames = {
  inherit: "",
  muted: "text-text-muted",
  subtle: "text-text-muted/40",
} as const;

export interface LoadingSpinnerProps {
  size?: keyof typeof spinnerSizeClassNames;
  tone?: keyof typeof spinnerToneClassNames;
  className?: string;
}

export function LoadingSpinner({
  size = "lg",
  tone = "inherit",
  className,
}: LoadingSpinnerProps) {
  return (
    <SpinnerIcon
      className={cn(
        "shrink-0 animate-spin stroke-[1.5]",
        spinnerSizeClassNames[size],
        spinnerToneClassNames[tone],
        className,
      )}
    />
  );
}

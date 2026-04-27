import { useTheme } from "../../context/ThemeContext";
import { Toaster as Sonner } from "sonner";

export function Toaster() {
  const { resolvedTheme } = useTheme();

  return (
    <Sonner
      theme={resolvedTheme as "light" | "dark"}
      position="bottom-right"
      offset={20}
      toastOptions={{
        classNames: {
          toast:
            "group toast ui-surface-toast w-full max-w-80 px-3 py-2 !bg-bg !text-text !border-border",
          description: "text-text-muted",
          actionButton:
            "h-[var(--ui-control-height-compact)] rounded-[var(--ui-radius-md)] bg-accent px-2.5 text-xs font-medium text-text-inverse transition-colors hover:bg-accent/90",
          cancelButton:
            "h-[var(--ui-control-height-compact)] rounded-[var(--ui-radius-md)] border border-border bg-transparent px-2.5 text-xs font-medium text-text transition-colors hover:bg-bg-muted",
          closeButton:
            "!border-border !bg-bg !text-text-muted transition-colors hover:!bg-bg-muted hover:!text-text",
          error: "!bg-bg !text-text !border-border",
          success: "!bg-bg !text-text !border-border",
          warning: "!bg-bg !text-text !border-border",
          info: "!bg-bg !text-text !border-border",
        },
      }}
    />
  );
}

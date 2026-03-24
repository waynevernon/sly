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
            "group toast ui-surface-dialog w-full max-w-80 !rounded-[var(--ui-radius-lg)] !shadow-[var(--ui-shadow-menu)] px-3 py-2 text-text",
          description: "text-text-muted",
          actionButton: "bg-accent text-white",
          cancelButton: "bg-bg-muted text-text",
          error: "!bg-bg !text-text !border-border",
          success: "!bg-bg !text-text !border-border",
          warning: "!bg-bg !text-text !border-border",
          info: "!bg-bg !text-text !border-border",
        },
      }}
    />
  );
}

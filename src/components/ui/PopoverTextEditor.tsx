import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";
import { Input } from "./Input";
import { MenuSurface } from "./MenuSurface";

interface PopoverTextEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string;
  onSubmit: (value: string) => void | boolean | Promise<void | boolean>;
  title: string;
  placeholder: string;
  icon: React.ReactNode;
  renderTrigger: (controls: { open: boolean; openEditor: () => void }) => React.ReactNode;
  suggestions?: string[];
  suggestionIcon?: React.ReactNode;
  className?: string;
  popoverClassName?: string;
  inputClassName?: string;
  maxSuggestions?: number;
  isSubmitting?: boolean;
  renderAuxiliaryContent?: (controls: {
    draft: string;
    setDraft: React.Dispatch<React.SetStateAction<string>>;
  }) => React.ReactNode;
}

export function PopoverTextEditor({
  open,
  onOpenChange,
  value,
  onSubmit,
  title,
  placeholder,
  icon,
  renderTrigger,
  suggestions = [],
  suggestionIcon,
  className,
  popoverClassName,
  inputClassName,
  maxSuggestions = 6,
  isSubmitting = false,
  renderAuxiliaryContent,
}: PopoverTextEditorProps) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLDivElement>(null);
  const popoverRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [draft, setDraft] = React.useState(value);
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const [position, setPosition] = React.useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const filteredSuggestions = React.useMemo(() => {
    const query = draft.trim().toLocaleLowerCase();
    return suggestions
      .filter((suggestion) => {
        const normalized = suggestion.trim();
        if (!normalized) return false;
        const normalizedKey = normalized.toLocaleLowerCase();
        if (normalizedKey === query) return false;
        if (!query) return true;
        return normalizedKey.includes(query);
      })
      .slice(0, maxSuggestions);
  }, [draft, maxSuggestions, suggestions]);

  const commitAndClose = React.useCallback(
    async (nextValue = draft) => {
      if (isSubmitting) return;

      try {
        const shouldClose = await onSubmit(nextValue.trim());
        if (shouldClose !== false) {
          onOpenChange(false);
        }
      } catch {
        // Keep the editor open when submit fails so callers can surface recovery.
      }
    },
    [draft, isSubmitting, onOpenChange, onSubmit],
  );

  const cancelAndClose = React.useCallback(() => {
    if (isSubmitting) return;
    setDraft(value);
    onOpenChange(false);
  }, [isSubmitting, onOpenChange, value]);

  React.useEffect(() => {
    if (!open) {
      setDraft(value);
      setActiveIndex(-1);
      setPosition(null);
      return;
    }

    setDraft(value);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [open, value]);

  React.useEffect(() => {
    setActiveIndex(filteredSuggestions.length > 0 ? 0 : -1);
  }, [filteredSuggestions]);

  React.useEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const triggerRect = triggerRef.current?.getBoundingClientRect();
      if (!triggerRect) return;

      const width = Math.min(384, Math.max(240, window.innerWidth - 32));
      const left = Math.min(
        Math.max(16, triggerRect.left),
        Math.max(16, window.innerWidth - width - 16),
      );

      setPosition({
        top: triggerRect.bottom + 8,
        left,
        width,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (isSubmitting) return;

      const target = event.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      ) {
        return;
      }

      void commitAndClose();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancelAndClose();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [cancelAndClose, commitAndClose, isSubmitting, open]);

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (filteredSuggestions.length === 0) return;
      setActiveIndex((current) => (current + 1) % filteredSuggestions.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (filteredSuggestions.length === 0) return;
      setActiveIndex((current) =>
        current <= 0 ? filteredSuggestions.length - 1 : current - 1,
      );
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (activeIndex >= 0 && activeIndex < filteredSuggestions.length) {
        void commitAndClose(filteredSuggestions[activeIndex]);
        return;
      }

      void commitAndClose();
      return;
    }

    if (event.key === "Tab") {
      void commitAndClose();
    }
  };

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <div ref={triggerRef}>
        {renderTrigger({
          open,
          openEditor: () => onOpenChange(true),
        })}
      </div>

      {open && position && typeof document !== "undefined"
        ? createPortal(
            <MenuSurface
              ref={popoverRef}
              style={{
                position: "fixed",
                top: position.top,
                left: position.left,
                width: position.width,
              }}
              className={cn(
                "z-50 animate-slide-down overflow-hidden p-0",
                popoverClassName,
              )}
            >
              <div className="flex items-center justify-between px-3.5 py-2.5">
                <div className="flex min-w-0 items-center gap-2 text-sm text-text-muted">
                  <span className="shrink-0">{icon}</span>
                  <span className="truncate">{title}</span>
                </div>
                <button
                  type="button"
                  onClick={cancelAndClose}
                  disabled={isSubmitting}
                  className="ui-focus-ring inline-flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-[var(--ui-radius-md)] text-text-muted transition-colors hover:bg-bg-muted hover:text-text"
                  aria-label={`Close ${title.toLocaleLowerCase()}`}
                >
                  <X className="h-3.5 w-3.5 stroke-[1.7]" />
                </button>
              </div>

              <div className="border-t border-border/50 px-3.5 py-3">
                <Input
                  ref={inputRef}
                  value={draft}
                  placeholder={placeholder}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={handleInputKeyDown}
                  disabled={isSubmitting}
                  className={cn(
                    "h-11 border-border/70 bg-bg px-3 text-base text-text placeholder:text-text-muted",
                    inputClassName,
                  )}
                />
                {renderAuxiliaryContent ? (
                  <div className="mt-2.5">
                    {renderAuxiliaryContent({ draft, setDraft })}
                  </div>
                ) : null}
              </div>

              {filteredSuggestions.length > 0 ? (
                <div className="border-t border-border/50 p-1.5">
                  <div className="flex flex-col gap-1">
                    {filteredSuggestions.map((suggestion, index) => {
                      const isActive = index === activeIndex;

                      return (
                        <button
                          key={suggestion}
                          type="button"
                          onMouseEnter={() => setActiveIndex(index)}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => void commitAndClose(suggestion)}
                          disabled={isSubmitting}
                          className={cn(
                            "ui-focus-ring flex w-full items-center gap-2 rounded-[var(--ui-radius-md)] px-2.5 py-1.5 text-left text-sm text-text transition-colors",
                            isActive ? "bg-bg-muted" : "hover:bg-bg-muted",
                          )}
                        >
                          {suggestionIcon ? (
                            <span className="shrink-0 text-text-muted">{suggestionIcon}</span>
                          ) : null}
                          <span className="truncate">{suggestion}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </MenuSurface>,
            document.body,
          )
        : null}
    </div>
  );
}

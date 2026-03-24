import * as Dialog from "@radix-ui/react-dialog";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  LUCIDE_ICON_CATALOG,
  type LucideIconCatalogEntry,
} from "../../lib/lucideIcons";
import { Button, Input, IconButton } from "../ui";
import {
  dialogOverlayClassName,
  dialogPanelClassName,
} from "../ui/DialogShell";
import { CheckIcon, FolderIcon, SearchIcon, XIcon } from "../icons";
const ICON_CATALOG: LucideIconCatalogEntry[] = LUCIDE_ICON_CATALOG;

const ICON_MAP = new Map(ICON_CATALOG.map((icon) => [icon.name, icon]));
const TILE_GAP = 10;
const TILE_MIN_WIDTH = 78;
const ROW_HEIGHT = 88;

interface FolderIconPickerModalProps {
  open: boolean;
  value: string | null;
  title: string;
  description?: string;
  onOpenChange: (open: boolean) => void;
  onSelect: (iconName: string | null) => void;
}

export function FolderIconPickerModal({
  open,
  value,
  title,
  description = "Search the offline Lucide catalog and pick a folder icon.",
  onOpenChange,
  onSelect,
}: FolderIconPickerModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridMeasureRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [gridWidth, setGridWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const deferredQuery = useDeferredValue(query);

  const filteredIcons = useMemo(() => {
    const normalizedQuery = deferredQuery
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-\s]/g, " ");
    const terms = normalizedQuery.split(/[\s-]+/).filter(Boolean);

    if (terms.length === 0) {
      return ICON_CATALOG;
    }

    return ICON_CATALOG.filter((icon) =>
      terms.every((term) => icon.searchText.includes(term)),
    );
  }, [deferredQuery]);

  const lanes = Math.max(
    1,
    Math.floor((gridWidth + TILE_GAP) / (TILE_MIN_WIDTH + TILE_GAP)),
  );
  const rowCount = Math.ceil(filteredIcons.length / lanes);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 6,
  });

  useEffect(() => {
    if (!open) return;

    setQuery("");
    const selectedIndex = value
      ? ICON_CATALOG.findIndex((icon) => icon.name === value)
      : -1;
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [open, value]);

  useEffect(() => {
    if (!open) return;

    const frameId = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });

    return () => cancelAnimationFrame(frameId);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    let observer: ResizeObserver | null = null;
    const frameId = requestAnimationFrame(() => {
      const element = gridMeasureRef.current;
      if (!element) return;

      const updateWidth = () => {
        setGridWidth(element.getBoundingClientRect().width);
      };

      updateWidth();
      observer = new ResizeObserver(updateWidth);
      observer.observe(element);
    });

    return () => {
      cancelAnimationFrame(frameId);
      observer?.disconnect();
    };
  }, [open]);

  useEffect(() => {
    if (filteredIcons.length === 0) {
      setActiveIndex(0);
      return;
    }

    if (activeIndex >= filteredIcons.length) {
      setActiveIndex(filteredIcons.length - 1);
    }
  }, [activeIndex, filteredIcons.length]);

  useEffect(() => {
    if (!open || filteredIcons.length === 0) return;
    rowVirtualizer.scrollToIndex(Math.floor(activeIndex / lanes), {
      align: "auto",
    });
  }, [activeIndex, filteredIcons.length, lanes, open, rowVirtualizer]);

  const previewIcon =
    filteredIcons[activeIndex] ?? (value ? ICON_MAP.get(value) ?? null : null);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!open) return;

    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        setActiveIndex((current) =>
          filteredIcons.length === 0
            ? 0
            : Math.min(current + 1, filteredIcons.length - 1),
        );
        break;
      case "ArrowLeft":
        event.preventDefault();
        setActiveIndex((current) => Math.max(current - 1, 0));
        break;
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((current) =>
          filteredIcons.length === 0
            ? 0
            : Math.min(current + lanes, filteredIcons.length - 1),
        );
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((current) => Math.max(current - lanes, 0));
        break;
      case "Enter":
        if (filteredIcons.length === 0) return;
        event.preventDefault();
        onSelect(filteredIcons[activeIndex]?.name ?? null);
        break;
      default:
        break;
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={`fixed inset-0 z-50 ${dialogOverlayClassName} data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0`}
        />
        <Dialog.Content
          onOpenAutoFocus={(event) => event.preventDefault()}
          onKeyDown={handleKeyDown}
          className={`fixed left-[50%] top-[50%] z-50 flex w-[min(calc(100vw-1.5rem),46rem)] max-h-[min(80vh,42rem)] translate-x-[-50%] translate-y-[-50%] flex-col overflow-hidden duration-200 data-[state=open]:animate-slide-down focus:outline-none ${dialogPanelClassName}`}
        >
          <div className="border-b border-border/80 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <Dialog.Title className="text-sm font-medium text-text">
                  {title}
                </Dialog.Title>
                <Dialog.Description className="text-xs text-text-muted">
                  {description}
                </Dialog.Description>
              </div>
              <IconButton
                title="Close"
                onClick={() => onOpenChange(false)}
                className="shrink-0"
              >
                <XIcon className="w-4.5 h-4.5 stroke-[1.6]" />
              </IconButton>
            </div>

            <div className="mt-3 flex flex-col gap-2.5">
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4.5 w-4.5 -translate-y-1/2 stroke-[1.6] text-text-muted/70" />
                <Input
                  ref={inputRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search Lucide icons..."
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  className="h-[var(--ui-control-height-prominent)] rounded-[var(--ui-radius-md)] border-border/90 bg-bg pl-10 pr-10"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="ui-focus-ring absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-bg-muted hover:text-text"
                    aria-label="Clear search"
                  >
                    <XIcon className="h-4 w-4 stroke-[1.8]" />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2 rounded-[var(--ui-radius-lg)] border border-border bg-bg-secondary/80 px-3 py-2">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--ui-radius-md)] bg-bg ring-1 ring-border/70">
                    {previewIcon ? (
                      <previewIcon.Component
                        className="h-5 w-5 text-text"
                        strokeWidth={1.9}
                      />
                    ) : (
                      <FolderIcon className="h-5 w-5 text-text" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium text-text">
                      {previewIcon?.name ?? "default-folder"}
                    </div>
                    <div className="text-[11px] text-text-muted">
                      {previewIcon ? "Selected icon" : "Default folder icon"}
                    </div>
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="md"
                  onClick={() => onSelect(null)}
                  className="h-[var(--ui-control-height-standard)] rounded-[var(--ui-radius-md)] px-3 text-xs"
                >
                  Use Default
                </Button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between px-4 pb-2.5 pt-2 text-[11px] text-text-muted">
            <span>
              {filteredIcons.length.toLocaleString()} icon
              {filteredIcons.length === 1 ? "" : "s"}
            </span>
            <span>Enter to select, arrows to navigate</span>
          </div>

          <div className="px-4 pb-4">
            <div
              ref={scrollRef}
              className="h-[22rem] overflow-auto rounded-[var(--ui-radius-lg)] border border-border/80 bg-bg-secondary/70 p-2.5 scrollbar-gutter-stable"
            >
              <div ref={gridMeasureRef} className="w-full">
                {filteredIcons.length === 0 ? (
                  <div className="flex h-44 flex-col items-center justify-center gap-2 rounded-[var(--ui-radius-lg)] border border-border bg-bg/60 text-center">
                    <div className="text-sm font-medium text-text">
                      No icons found
                    </div>
                    <div className="max-w-xs text-sm text-text-muted">
                      Try a shorter search or another keyword.
                    </div>
                  </div>
                ) : (
                  <div
                    className="relative"
                    style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
                  >
                    {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                      const startIndex = virtualRow.index * lanes;
                      const rowItems = filteredIcons.slice(
                        startIndex,
                        startIndex + lanes,
                      );

                      return (
                        <div
                          key={virtualRow.key}
                          className="absolute left-0 top-0 w-full"
                          style={{
                            transform: `translateY(${virtualRow.start}px)`,
                          }}
                        >
                          <div
                            className="grid gap-2.5"
                            style={{
                              gridTemplateColumns: `repeat(${lanes}, minmax(0, 1fr))`,
                            }}
                          >
                            {rowItems.map((icon, columnIndex) => {
                              const index = startIndex + columnIndex;
                              const isSelected = icon.name === value;
                              const isActive = index === activeIndex;

                              return (
                                <button
                                  key={icon.name}
                                  type="button"
                                  title={icon.name}
                                  aria-label={icon.name}
                                  aria-selected={isSelected}
                                  onMouseEnter={() => setActiveIndex(index)}
                                  onFocus={() => setActiveIndex(index)}
                                  onClick={() => onSelect(icon.name)}
                                  className={`group ui-focus-ring relative flex min-h-[78px] flex-col items-center justify-center gap-1.5 rounded-[var(--ui-radius-lg)] border px-2 py-2.5 text-center transition-[border-color,background-color,transform,box-shadow] duration-150 ${
                                    isSelected
                                      ? "border-accent bg-accent/7 shadow-[0_0_0_1px_var(--color-accent)]"
                                      : isActive
                                        ? "border-text-muted/45 bg-bg shadow-sm"
                                        : "border-transparent bg-bg/75 hover:border-border hover:bg-bg"
                                  }`}
                                >
                                  {isSelected && (
                                    <span className="absolute right-1.5 top-1.5 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-accent text-text-inverse">
                                      <CheckIcon className="h-2.75 w-2.75 stroke-[2.4]" />
                                    </span>
                                  )}
                                  <icon.Component
                                    className="h-5 w-5 shrink-0 text-text"
                                    strokeWidth={1.85}
                                  />
                                  <span className="max-w-full truncate text-[11px] font-medium leading-4 text-text-muted group-hover:text-text">
                                    {icon.name}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

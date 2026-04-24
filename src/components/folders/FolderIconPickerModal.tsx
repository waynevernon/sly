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
import type { FolderAppearance, FolderColorId } from "../../types/note";
import {
  type EmojiItem,
  getEmojiCatalogItems,
  getEmojiItem,
  searchEmojiShortcodes,
} from "../../lib/emoji";
import {
  FOLDER_COLOR_IDS,
  FOLDER_COLOR_PALETTE,
  sanitizeFolderAppearance,
} from "../../lib/folderIcons";
import { cn } from "../../lib/utils";
import {
  LUCIDE_ICON_CATALOG,
  type LucideIconCatalogEntry,
  searchLucideIcons,
} from "../../lib/lucideIcons";
import { FolderGlyph } from "./FolderGlyph";
import { Button, Input, IconButton } from "../ui";
import {
  dialogOverlayClassName,
  dialogPanelClassName,
} from "../ui/DialogShell";
import { CheckIcon, SearchIcon, XIcon } from "../icons";

const ICON_CATALOG: LucideIconCatalogEntry[] = LUCIDE_ICON_CATALOG;
const EMOJI_CATALOG = getEmojiCatalogItems();
const TILE_GAP = 10;
const TILE_MIN_WIDTH = 78;
const ROW_HEIGHT = 88;
const INITIAL_RENDERED_ROWS = 8;

type FolderStyleSource = "icons" | "emoji";
type FolderPickerResult =
  | {
      id: string;
      kind: "icon";
      label: string;
      icon: LucideIconCatalogEntry;
    }
  | {
      id: string;
      kind: "emoji";
      label: string;
      emoji: EmojiItem;
    };

interface FolderIconPickerModalProps {
  open: boolean;
  value: FolderAppearance | null;
  title: string;
  description?: string;
  onOpenChange: (open: boolean) => void;
  onApply: (appearance: FolderAppearance | null) => Promise<void> | void;
}

export function FolderIconPickerModal({
  open,
  value,
  title,
  description = "Pick a folder icon or emoji and apply a folder color.",
  onOpenChange,
  onApply,
}: FolderIconPickerModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridMeasureRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<FolderStyleSource>("icons");
  const [draftAppearance, setDraftAppearance] = useState<FolderAppearance | null>(
    null,
  );
  const [gridWidth, setGridWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const deferredQuery = useDeferredValue(query);

  const filteredIcons = useMemo(() => {
    if (!deferredQuery.trim()) return ICON_CATALOG;
    return searchLucideIcons(deferredQuery);
  }, [deferredQuery]);

  const emojiResults = useMemo(() => {
    if (!deferredQuery.trim()) return EMOJI_CATALOG;
    return searchEmojiShortcodes(deferredQuery);
  }, [deferredQuery]);

  const resultCount = source === "icons" ? filteredIcons.length : emojiResults.length;
  const visibleResults = useMemo<FolderPickerResult[]>(() => {
    if (source === "icons") {
      return filteredIcons.map((icon) => ({
        id: icon.name,
        kind: "icon",
        label: icon.name,
        icon,
      }));
    }

    return emojiResults.map((emoji) => ({
      id: emoji.id,
      kind: "emoji",
      label: `:${emoji.shortcode}:`,
      emoji,
    }));
  }, [emojiResults, filteredIcons, source]);
  const lanes = Math.max(
    1,
    Math.floor((gridWidth + TILE_GAP) / (TILE_MIN_WIDTH + TILE_GAP)),
  );
  const rowCount = Math.ceil(resultCount / lanes);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 6,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();
  const renderedRows =
    virtualRows.length > 0
      ? virtualRows.map((row) => ({
          key: row.key,
          index: row.index,
          start: row.start,
        }))
      : Array.from(
          { length: Math.min(rowCount, INITIAL_RENDERED_ROWS) },
          (_, index) => ({
            key: `initial-${index}`,
            index,
            start: index * ROW_HEIGHT,
          }),
        );
  const gridHeight = Math.max(
    rowVirtualizer.getTotalSize(),
    rowCount * ROW_HEIGHT,
  );

  useEffect(() => {
    if (!open) return;

    setQuery("");
    setDraftAppearance(value ?? null);
    setSource(value?.icon?.kind === "emoji" ? "emoji" : "icons");
    setActiveIndex(0);
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
      const element = gridMeasureRef.current ?? scrollRef.current;
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
  }, [open, resultCount, source]);

  useEffect(() => {
    if (!open || resultCount === 0) return;

    const frameId = requestAnimationFrame(() => {
      rowVirtualizer.measure();
    });

    return () => cancelAnimationFrame(frameId);
  }, [lanes, open, resultCount, rowVirtualizer, source]);

  useEffect(() => {
    if (resultCount === 0) {
      setActiveIndex(0);
      return;
    }

    setActiveIndex((current) => Math.min(current, resultCount - 1));
  }, [resultCount]);

  useEffect(() => {
    if (!open || resultCount === 0) return;
    rowVirtualizer.scrollToIndex(Math.floor(activeIndex / lanes), {
      align: "auto",
    });
  }, [activeIndex, lanes, open, resultCount, rowVirtualizer]);

  const selectedColorId = draftAppearance?.colorId ?? null;
  const selectedLucideName =
    draftAppearance?.icon?.kind === "lucide" ? draftAppearance.icon.name : null;
  const selectedEmojiShortcode =
    draftAppearance?.icon?.kind === "emoji"
      ? draftAppearance.icon.shortcode
      : null;
  const selectedEmojiId = selectedEmojiShortcode
    ? getEmojiItem(selectedEmojiShortcode)?.id ?? null
    : null;
  const selectedSwatchColor = selectedColorId
    ? FOLDER_COLOR_PALETTE[selectedColorId].swatch
    : null;
  const previewAppearance = sanitizeFolderAppearance(draftAppearance);

  const handleSelectColor = (colorId: FolderColorId | null) => {
    setDraftAppearance((current) => {
      const nextAppearance = sanitizeFolderAppearance({
        ...current,
        colorId: colorId ?? undefined,
      });
      return nextAppearance;
    });
  };

  const handleSelectLucide = (name: string) => {
    setDraftAppearance((current) =>
      sanitizeFolderAppearance({
        ...current,
        icon: { kind: "lucide", name },
      }),
    );
  };

  const handleSelectEmoji = (shortcode: string) => {
    setDraftAppearance((current) =>
      sanitizeFolderAppearance({
        ...current,
        icon: { kind: "emoji", shortcode },
      }),
    );
  };

  const handleReset = () => {
    setDraftAppearance(null);
  };

  const handleSelectResult = (result: FolderPickerResult) => {
    if (result.kind === "icon") {
      handleSelectLucide(result.icon.name);
      return;
    }

    handleSelectEmoji(result.emoji.shortcode);
  };

  const handleApply = async () => {
    if (isSubmitting) return;

    try {
      setIsSubmitting(true);
      await onApply(sanitizeFolderAppearance(draftAppearance));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!open) return;

    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        setActiveIndex((current) =>
          resultCount === 0 ? 0 : Math.min(current + 1, resultCount - 1),
        );
        break;
      case "ArrowLeft":
        event.preventDefault();
        setActiveIndex((current) => Math.max(current - 1, 0));
        break;
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((current) =>
          resultCount === 0
            ? 0
            : Math.min(current + lanes, resultCount - 1),
        );
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((current) => Math.max(current - lanes, 0));
        break;
      case "Enter": {
        if (resultCount === 0) return;
        event.preventDefault();
        const activeResult = visibleResults[activeIndex];
        if (activeResult) handleSelectResult(activeResult);
        break;
      }
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
          className={`fixed left-[50%] top-[50%] z-50 flex h-[min(90vh,44rem)] w-[min(calc(100vw-1.5rem),46rem)] translate-x-[-50%] translate-y-[-50%] flex-col overflow-hidden duration-200 data-[state=open]:animate-slide-down focus:outline-none ${dialogPanelClassName}`}
        >
          <div className="border-b border-border/80 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <div
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--ui-radius-md)] text-text-muted"
                  style={
                    selectedSwatchColor
                      ? { color: selectedSwatchColor }
                      : undefined
                  }
                >
                  <FolderGlyph
                    icon={previewAppearance?.icon ?? null}
                    className="h-4.5 w-4.5 text-current"
                    strokeWidth={1.8}
                  />
                </div>
                <Dialog.Title
                  className="truncate text-sm font-medium text-text"
                  style={
                    selectedSwatchColor
                      ? { color: selectedSwatchColor }
                      : undefined
                  }
                >
                  {title}
                </Dialog.Title>
                <Dialog.Description className="sr-only">
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

            <div className="mt-3">
              <div className="flex items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4.5 w-4.5 -translate-y-1/2 stroke-[1.6] text-text-muted/70" />
                  <Input
                    ref={inputRef}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={
                      source === "icons"
                        ? "Search Lucide icons..."
                        : "Search emoji names or aliases..."
                    }
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

                <div className="relative flex w-40 items-center rounded-[var(--ui-radius-md)] border border-border bg-bg-secondary/80 p-0.5">
                  <div
                    className="pointer-events-none absolute bottom-0.5 top-0.5 rounded-[calc(var(--ui-radius-md)-2px)] bg-bg shadow-sm transition-transform duration-[var(--ui-motion-duration-fade)] ease-[var(--ui-motion-ease-standard)]"
                    style={{
                      left: 2,
                      width: "calc((100% - 4px) / 2)",
                      transform: `translateX(calc(${
                        source === "icons" ? 0 : 1
                      } * 100%))`,
                    }}
                  />
                  {(["icons", "emoji"] as const).map((nextSource) => (
                    <button
                      key={nextSource}
                      type="button"
                      onClick={() => {
                        setSource(nextSource);
                        setActiveIndex(0);
                      }}
                      className={cn(
                        "ui-focus-ring relative flex-1 rounded-[calc(var(--ui-radius-md)-2px)] px-3 py-1.5 text-xs font-medium transition-colors duration-[var(--ui-motion-duration-fade)]",
                        source === nextSource
                          ? "text-text"
                          : "text-text-muted hover:text-text",
                      )}
                      aria-pressed={source === nextSource}
                    >
                      {nextSource === "icons" ? "Icons" : "Emoji"}
                    </button>
                  ))}
                </div>
                <div className="w-20 shrink-0 text-right text-[11px] text-text-muted">
                  {source === "icons" ? (
                    <span>
                      {filteredIcons.length.toLocaleString()} icon
                      {filteredIcons.length === 1 ? "" : "s"}
                    </span>
                  ) : (
                    <span>
                      {emojiResults.length.toLocaleString()} emoji
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col px-4 py-4">
            <div
              ref={scrollRef}
              className="ui-scrollbar-overlay min-h-0 flex-1 overflow-auto rounded-[var(--ui-radius-lg)] border border-border/80 bg-bg-secondary/70 p-2.5 scrollbar-gutter-stable"
            >
              {visibleResults.length === 0 ? (
                <div ref={gridMeasureRef} className="w-full">
                  <div className="flex h-44 flex-col items-center justify-center gap-2 rounded-[var(--ui-radius-lg)] border border-border bg-bg/60 text-center">
                    <div className="text-sm font-medium text-text">
                      {source === "icons"
                        ? "No icons found"
                        : "No matching emoji"}
                    </div>
                    <div className="max-w-xs text-sm text-text-muted">
                      {source === "icons"
                        ? "Try a shorter search or another keyword."
                        : "Try another alias or a shorter search."}
                    </div>
                  </div>
                </div>
              ) : (
                <div ref={gridMeasureRef} className="w-full">
                  <div
                    className="relative"
                    style={{ height: `${gridHeight}px` }}
                  >
                    {renderedRows.map((virtualRow) => {
                      const startIndex = virtualRow.index * lanes;
                      const rowItems = visibleResults.slice(
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
                            {rowItems.map((item, columnIndex) => {
                              const index = startIndex + columnIndex;
                              const isSelected =
                                item.kind === "icon"
                                  ? item.icon.name === selectedLucideName
                                  : item.id === selectedEmojiId;
                              const isActive = index === activeIndex;

                              return (
                                <button
                                  key={item.id}
                                  type="button"
                                  title={item.label}
                                  aria-label={item.label}
                                  aria-selected={isSelected}
                                  onMouseEnter={() => setActiveIndex(index)}
                                  onFocus={() => setActiveIndex(index)}
                                  onClick={() => handleSelectResult(item)}
                                  className={`group ui-focus-ring relative flex min-h-[78px] flex-col items-center justify-center gap-1.5 rounded-[var(--ui-radius-lg)] border px-2 py-2.5 text-center transition-[border-color,background-color,transform,box-shadow] duration-[var(--ui-motion-duration-fade)] ${
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
                                  {item.kind === "icon" ? (
                                    <item.icon.Component
                                      className="h-5 w-5 shrink-0 text-text"
                                      strokeWidth={1.85}
                                    />
                                  ) : (
                                    <span className="flex h-5 w-5 items-center justify-center text-[1.25rem] leading-none">
                                      {item.emoji.emoji}
                                    </span>
                                  )}
                                  <span className="max-w-full truncate text-[11px] font-medium leading-4 text-text-muted group-hover:text-text">
                                    {item.label}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/80 px-4 py-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleSelectColor(null)}
                className={`ui-focus-ring inline-flex h-7 items-center justify-center rounded-full border px-2.5 text-[11px] font-medium transition-colors ${
                  selectedColorId === null
                    ? "border-accent bg-accent/7 text-text"
                    : "border-border bg-bg text-text-muted hover:text-text"
                }`}
                aria-pressed={selectedColorId === null}
              >
                Default
              </button>
              <div className="flex flex-wrap items-center gap-1.5">
                {FOLDER_COLOR_IDS.map((colorId) => {
                  const swatchColor = FOLDER_COLOR_PALETTE[colorId].swatch;
                  const isSelected = selectedColorId === colorId;

                  return (
                    <button
                      key={colorId}
                      type="button"
                      onClick={() => handleSelectColor(colorId)}
                      className={`ui-focus-ring relative flex h-7 w-7 items-center justify-center rounded-full border transition-[transform,border-color,box-shadow] duration-[var(--ui-motion-duration-fade)] ${
                        isSelected
                          ? "border-text shadow-[0_0_0_1px_var(--color-bg),0_0_0_3px_color-mix(in_srgb,var(--color-accent)_26%,transparent)]"
                          : "border-border/80 hover:scale-[1.04]"
                      }`}
                      aria-label={`Use ${colorId} folder color`}
                      aria-pressed={isSelected}
                    >
                      <span
                        className="h-4.5 w-4.5 rounded-full"
                        style={{ backgroundColor: swatchColor }}
                      />
                      {isSelected && (
                        <span className="absolute inset-0 flex items-center justify-center text-white">
                          <CheckIcon className="h-3.25 w-3.25 stroke-[2.4]" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="ghost"
                size="md"
                onClick={handleReset}
                disabled={isSubmitting}
              >
                Reset
              </Button>
              <Button
                variant="ghost"
                size="md"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={() => void handleApply()}
                disabled={isSubmitting}
              >
                Apply
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

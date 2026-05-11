import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Editor as TiptapEditor } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import { ListTree } from "lucide-react";
import { cn } from "../../lib/utils";
import { finishNoteOpenTiming, markNoteOpenTiming } from "../../lib/noteOpenTiming";
import { PanelEmptyState } from "../ui";
import {
  extractOutlineItems,
  findActiveOutlineFromHeadingTops,
  findActiveOutlineFromSelection,
  type OutlineItem,
} from "./rightPanelOutline";
import { PaneResizeHandle } from "./PaneResizeHandle";

interface RightPanelProps {
  editor: TiptapEditor | null;
  scrollContainer: HTMLDivElement | null;
  noteId: string | null;
  hasNote: boolean;
  visible: boolean;
  width: number;
  onWidthChange: (width: number) => void;
}

const ACTIVE_HEADING_TOP_OFFSET = 72;
const OUTLINE_UPDATE_DEBOUNCE_MS = 120;
const OUTLINE_SCROLL_MARGIN = 24;

export function RightPanel({
  editor,
  scrollContainer,
  noteId,
  hasNote,
  visible,
  width,
  onWidthChange,
}: RightPanelProps) {
  const [outlineItems, setOutlineItems] = useState<OutlineItem[]>([]);
  const [activeOutlineId, setActiveOutlineId] = useState<string | null>(null);
  const [liveWidth, setLiveWidth] = useState(width);
  const [isResizing, setIsResizing] = useState(false);
  const resizeDragRef = useRef<{ startX: number; startWidth: number } | null>(
    null,
  );
  const liveWidthRef = useRef(liveWidth);
  const outlineScrollRef = useRef<HTMLDivElement>(null);
  const outlineItemsRef = useRef<OutlineItem[]>([]);
  const outlineViewportFrameRef = useRef<number | null>(null);
  const outlineUpdateTimeoutRef = useRef<number | null>(null);
  const [hydratedPanelKey, setHydratedPanelKey] = useState<string | null>(null);
  outlineItemsRef.current = outlineItems;
  liveWidthRef.current = liveWidth;
  const outlineActive = visible;
  const panelHydrationKey =
    visible && hasNote && noteId ? `${noteId}:outline` : null;
  const panelHydrated =
    panelHydrationKey !== null && hydratedPanelKey === panelHydrationKey;

  useEffect(() => {
    if (!isResizing) {
      setLiveWidth(width);
    }
  }, [width, isResizing]);

  const clearPendingOutlineWork = useCallback(() => {
    if (outlineViewportFrameRef.current !== null) {
      cancelAnimationFrame(outlineViewportFrameRef.current);
      outlineViewportFrameRef.current = null;
    }
    if (outlineUpdateTimeoutRef.current !== null) {
      window.clearTimeout(outlineUpdateTimeoutRef.current);
      outlineUpdateTimeoutRef.current = null;
    }
  }, []);

  const updateOutline = useCallback((): OutlineItem[] => {
    if (!editor || !hasNote || !noteId) {
      setOutlineItems([]);
      setActiveOutlineId(null);
      return [];
    }

    const nextItems = extractOutlineItems(editor.state.doc);
    const activeFromSelection = findActiveOutlineFromSelection(
      nextItems,
      editor.state.selection.from,
    );
    startTransition(() => {
      setOutlineItems(nextItems);
      setActiveOutlineId(activeFromSelection?.id ?? null);
    });
    return nextItems;
  }, [editor, hasNote, noteId]);

  const updateActiveFromSelection = useCallback(() => {
    if (!editor || !hasNote || !noteId) {
      setActiveOutlineId(null);
      return;
    }

    const active = findActiveOutlineFromSelection(
      outlineItemsRef.current,
      editor.state.selection.from,
    );
    setActiveOutlineId(active?.id ?? null);
  }, [editor, hasNote, noteId]);

  const updateActiveFromViewport = useCallback((items = outlineItemsRef.current) => {
    if (!editor || !hasNote || !scrollContainer || items.length === 0) {
      return;
    }

    const containerRect = scrollContainer.getBoundingClientRect();
    const thresholdTop = containerRect.top + ACTIVE_HEADING_TOP_OFFSET;
    const headingTops = items
      .map((item) => {
        const node = editor.view.nodeDOM(item.pos);
        if (!(node instanceof HTMLElement)) {
          return null;
        }

        return {
          item,
          top: node.getBoundingClientRect().top,
        };
      })
      .filter((value): value is { item: OutlineItem; top: number } => Boolean(value))
      .sort((a, b) => a.item.pos - b.item.pos);

    const active = findActiveOutlineFromHeadingTops(headingTops, thresholdTop);
    if (active) {
      setActiveOutlineId(active.id);
    }
  }, [editor, hasNote, scrollContainer]);

  useEffect(() => {
    if (!panelHydrationKey) {
      setHydratedPanelKey(null);
      return;
    }

    setHydratedPanelKey(null);
    startTransition(() => {
      setHydratedPanelKey(panelHydrationKey);
    });
  }, [noteId, panelHydrationKey]);

  useEffect(() => {
    if (!editor || !hasNote || !outlineActive || !panelHydrated || !noteId) {
      clearPendingOutlineWork();
      setOutlineItems([]);
      setActiveOutlineId(null);
      return;
    }

    const hydrateOutline = (stage: "initial" | "update") => {
      const nextItems = updateOutline();
      outlineViewportFrameRef.current = requestAnimationFrame(() => {
        updateActiveFromViewport(nextItems);
        if (stage === "initial") {
          markNoteOpenTiming(noteId, "outline hydrated");
          finishNoteOpenTiming(noteId, "right panel hydrated");
        }
      });
    };

    hydrateOutline("initial");

    const handleUpdate = () => {
      clearPendingOutlineWork();
      outlineUpdateTimeoutRef.current = window.setTimeout(() => {
        hydrateOutline("update");
      }, OUTLINE_UPDATE_DEBOUNCE_MS);
    };

    const handleSelectionUpdate = () => {
      updateActiveFromSelection();
    };

    editor.on("update", handleUpdate);
    editor.on("selectionUpdate", handleSelectionUpdate);

    return () => {
      clearPendingOutlineWork();
      editor.off("update", handleUpdate);
      editor.off("selectionUpdate", handleSelectionUpdate);
    };
  }, [
    clearPendingOutlineWork,
    editor,
    hasNote,
    outlineActive,
    panelHydrated,
    noteId,
    updateActiveFromSelection,
    updateActiveFromViewport,
    updateOutline,
  ]);

  useEffect(() => {
    if (!scrollContainer || !outlineActive || !panelHydrated) return;

    const handleScroll = () => {
      updateActiveFromViewport();
    };

    handleScroll();
    scrollContainer.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      scrollContainer.removeEventListener("scroll", handleScroll);
    };
  }, [outlineActive, panelHydrated, scrollContainer, updateActiveFromViewport]);

  useEffect(() => {
    if (!outlineActive || !panelHydrated || !activeOutlineId) return;

    const activeElement = outlineScrollRef.current?.querySelector<HTMLElement>(
      `[data-outline-id="${activeOutlineId}"]`,
    );
    activeElement?.scrollIntoView({ block: "nearest" });
  }, [activeOutlineId, outlineActive, panelHydrated]);

  useEffect(() => {
    return () => {
      clearPendingOutlineWork();
    };
  }, [clearPendingOutlineWork]);

  const startResize = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      resizeDragRef.current = {
        startX: event.clientX,
        startWidth: liveWidth,
      };
      setIsResizing(true);

      const onMouseMove = (moveEvent: MouseEvent) => {
        const dragState = resizeDragRef.current;
        if (!dragState) return;

        const nextWidth = dragState.startWidth - (moveEvent.clientX - dragState.startX);
        setLiveWidth(Math.min(Math.max(nextWidth, 200), 420));
      };

      const onMouseUp = () => {
        resizeDragRef.current = null;
        setIsResizing(false);
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        onWidthChange(liveWidthRef.current);
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [liveWidth, onWidthChange],
  );

  const handleOutlineSelect = useCallback(
    (item: OutlineItem) => {
      if (!editor) return;

      const selectionPos = Math.min(item.pos + 1, editor.state.doc.content.size);
      const headingElement = editor.view.nodeDOM(item.pos);
      const canScrollHeading =
        scrollContainer !== null && headingElement instanceof HTMLElement;
      const transaction = editor.state.tr.setSelection(
        TextSelection.create(editor.state.doc, selectionPos),
      );
      if (!canScrollHeading) {
        transaction.scrollIntoView();
      }

      editor.view.dispatch(transaction);
      editor.commands.focus(undefined, { scrollIntoView: false });

      if (canScrollHeading) {
        const containerRect = scrollContainer.getBoundingClientRect();
        const headingRect = headingElement.getBoundingClientRect();
        const targetScrollTop =
          scrollContainer.scrollTop +
          headingRect.top -
          containerRect.top -
          OUTLINE_SCROLL_MARGIN;

        scrollContainer.scrollTo({
          top: Math.max(0, targetScrollTop),
          behavior: "smooth",
        });
      }

      setActiveOutlineId(item.id);
    },
    [editor, scrollContainer],
  );

  const emptyState = useMemo(() => {
    if (!hasNote) {
      return {
        title: "Open a note",
        message: "Open a note to see its outline.",
      };
    }
    return {
      title: "No headings yet",
      message: "No section headings in this note yet.",
    };
  }, [hasNote]);

  return (
    <div className={cn("relative h-full shrink-0", isResizing && "select-none")}>
      {visible && (
        <PaneResizeHandle
          ariaLabel="Resize right panel"
          align="left"
          onMouseDown={startResize}
        />
      )}
      <div
        className={cn(
          "h-full shrink-0 overflow-hidden bg-bg",
          !isResizing &&
            "transition-[width,opacity,transform] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          visible
            ? "opacity-100 translate-x-0"
            : "w-0 opacity-0 translate-x-3 pointer-events-none",
        )}
        style={visible ? { width: liveWidth } : undefined}
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className="ui-pane-drag-region" data-tauri-drag-region></div>
          <div className="ui-pane-header border-border/80">
            <div className="flex min-w-0 items-center gap-2 font-medium text-base text-text">
              <ListTree className="h-4.25 w-4.25 shrink-0 text-text-muted/80 stroke-[1.7]" />
              Outline
            </div>
          </div>

          <div
            ref={outlineScrollRef}
            className="ui-scrollbar-overlay flex flex-1 flex-col overflow-y-auto px-2 pt-2.5 pb-2"
          >
            {!panelHydrated && hasNote ? (
              <PanelEmptyState message="Loading outline..." />
            ) : outlineItems.length === 0 ? (
              <PanelEmptyState
                icon={<ListTree />}
                title={emptyState.title}
                message={emptyState.message}
              />
            ) : (
              <div className="space-y-1">
                {outlineItems.map((item) => {
                  const isActive = item.id === activeOutlineId;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      data-outline-id={item.id}
                      onClick={() => handleOutlineSelect(item)}
                      className={cn(
                        "ui-focus-ring flex w-full items-start rounded-[var(--ui-radius-md)] px-2 py-1.5 text-left text-sm transition-colors",
                        isActive
                          ? "bg-state-selected text-text"
                          : "text-text-muted hover:bg-state-hover hover:text-text",
                      )}
                      style={{ paddingLeft: `${8 + (item.level - 1) * 12}px` }}
                    >
                      <span className="min-w-0 truncate">{item.text}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

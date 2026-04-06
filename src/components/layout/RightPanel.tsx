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
import { ListTree, Sparkles } from "lucide-react";
import { cn } from "../../lib/utils";
import { finishNoteOpenTiming, markNoteOpenTiming } from "../../lib/noteOpenTiming";
import type { RightPanelTab } from "../../types/note";
import { PanelEmptyState, Tooltip } from "../ui";
import {
  extractOutlineItems,
  findActiveOutlineFromHeadingTops,
  findActiveOutlineFromSelection,
  type OutlineItem,
} from "./rightPanelOutline";
import {
  RightPanelAssistant,
  type RightPanelAssistantProps,
} from "./RightPanelAssistant";

interface RightPanelProps {
  editor: TiptapEditor | null;
  scrollContainer: HTMLDivElement | null;
  noteId: string | null;
  hasNote: boolean;
  visible: boolean;
  width: number;
  activeTab: RightPanelTab;
  onTabChange: (tab: RightPanelTab) => void;
  onWidthChange: (width: number) => void;
  assistantProps: RightPanelAssistantProps;
}

const ACTIVE_HEADING_TOP_OFFSET = 72;
const OUTLINE_UPDATE_DEBOUNCE_MS = 120;
const RIGHT_PANEL_TABS: Array<{
  tab: RightPanelTab;
  label: string;
  Icon: typeof ListTree;
}> = [
  {
    tab: "outline",
    label: "Outline",
    Icon: ListTree,
  },
  {
    tab: "assistant",
    label: "Assistant",
    Icon: Sparkles,
  },
];

export function RightPanel({
  editor,
  scrollContainer,
  noteId,
  hasNote,
  visible,
  width,
  activeTab,
  onTabChange,
  onWidthChange,
  assistantProps,
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
  const panelHydrationFrameRef = useRef<number | null>(null);
  const outlineHydrationFrameRef = useRef<number | null>(null);
  const outlineViewportFrameRef = useRef<number | null>(null);
  const outlineUpdateTimeoutRef = useRef<number | null>(null);
  const [hydratedPanelKey, setHydratedPanelKey] = useState<string | null>(null);
  outlineItemsRef.current = outlineItems;
  liveWidthRef.current = liveWidth;
  const outlineActive = visible && activeTab === "outline";
  const panelHydrationKey =
    visible && hasNote && noteId ? `${noteId}:${activeTab}` : null;
  const panelHydrated =
    panelHydrationKey !== null && hydratedPanelKey === panelHydrationKey;

  useEffect(() => {
    if (!isResizing) {
      setLiveWidth(width);
    }
  }, [width, isResizing]);

  const clearPendingOutlineWork = useCallback(() => {
    if (outlineHydrationFrameRef.current !== null) {
      cancelAnimationFrame(outlineHydrationFrameRef.current);
      outlineHydrationFrameRef.current = null;
    }
    if (outlineViewportFrameRef.current !== null) {
      cancelAnimationFrame(outlineViewportFrameRef.current);
      outlineViewportFrameRef.current = null;
    }
    if (outlineUpdateTimeoutRef.current !== null) {
      window.clearTimeout(outlineUpdateTimeoutRef.current);
      outlineUpdateTimeoutRef.current = null;
    }
  }, []);

  const updateOutline = useCallback(() => {
    if (!editor || !hasNote || !noteId) {
      setOutlineItems([]);
      setActiveOutlineId(null);
      return;
    }

    const nextItems = extractOutlineItems(editor.state.doc);
    setOutlineItems(nextItems);

    const activeFromSelection = findActiveOutlineFromSelection(
      nextItems,
      editor.state.selection.from,
    );
    startTransition(() => {
      setOutlineItems(nextItems);
      setActiveOutlineId(activeFromSelection?.id ?? null);
    });
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
    if (panelHydrationFrameRef.current !== null) {
      cancelAnimationFrame(panelHydrationFrameRef.current);
      panelHydrationFrameRef.current = null;
    }

    if (!panelHydrationKey) {
      setHydratedPanelKey(null);
      return;
    }

    setHydratedPanelKey(null);
    panelHydrationFrameRef.current = requestAnimationFrame(() => {
      startTransition(() => {
        setHydratedPanelKey(panelHydrationKey);
      });
      if (activeTab === "assistant" && noteId) {
        finishNoteOpenTiming(noteId, "assistant panel hydrated");
      }
    });

    return () => {
      if (panelHydrationFrameRef.current !== null) {
        cancelAnimationFrame(panelHydrationFrameRef.current);
        panelHydrationFrameRef.current = null;
      }
    };
  }, [activeTab, noteId, panelHydrationKey]);

  useEffect(() => {
    if (!editor || !hasNote || !outlineActive || !panelHydrated || !noteId) {
      clearPendingOutlineWork();
      setOutlineItems([]);
      setActiveOutlineId(null);
      return;
    }

    const hydrateOutline = (stage: "initial" | "update") => {
      updateOutline();
      outlineViewportFrameRef.current = requestAnimationFrame(() => {
        updateActiveFromViewport();
        if (stage === "initial") {
          markNoteOpenTiming(noteId, "outline hydrated");
          finishNoteOpenTiming(noteId, "right panel hydrated");
        }
      });
    };

    outlineHydrationFrameRef.current = requestAnimationFrame(() => {
      hydrateOutline("initial");
    });

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
      if (panelHydrationFrameRef.current !== null) {
        cancelAnimationFrame(panelHydrationFrameRef.current);
      }
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
      const transaction = editor.state.tr.setSelection(
        TextSelection.create(editor.state.doc, selectionPos),
      );

      editor.view.dispatch(transaction);
      editor.commands.focus();
      setActiveOutlineId(item.id);

      if (scrollContainer) {
        const node = editor.view.nodeDOM(item.pos);
        if (node instanceof HTMLElement) {
          const containerRect = scrollContainer.getBoundingClientRect();
          const nodeRect = node.getBoundingClientRect();
          const delta = nodeRect.top - containerRect.top;
          scrollContainer.scrollTop += delta - 8;
        }
      }
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

  const headerTitle = useMemo(() => {
    if (activeTab === "assistant") {
      return (
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate">Assistant</span>
          <span className="inline-flex shrink-0 rounded-full border border-border bg-bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-text-muted">
            Beta
          </span>
        </div>
      );
    }

    return "Outline";
  }, [activeTab]);

  return (
    <div className={cn("h-full shrink-0 flex", isResizing && "select-none")}>
      {visible && (
        <div
          className="relative w-1 shrink-0 cursor-col-resize group z-10"
          onMouseDown={startResize}
        >
          <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent group-hover:bg-border transition-colors duration-150" />
          <div
            className="absolute left-0 right-0 h-px bg-border/80"
            style={{
              top: "calc(var(--ui-drag-region-height) + var(--ui-pane-header-height) - 1px)",
            }}
          />
        </div>
      )}

      <div
        className={cn(
          "h-full shrink-0 overflow-hidden border-l border-border/80 bg-bg",
          !isResizing &&
            "transition-[width,opacity,transform] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          visible
            ? "opacity-100 translate-x-0"
            : "w-0 opacity-0 translate-x-3 pointer-events-none border-l-0",
        )}
        style={visible ? { width: liveWidth } : undefined}
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className="ui-pane-drag-region" data-tauri-drag-region></div>
          <div className="ui-pane-header border-border/80">
            <div className="min-w-0 font-medium text-base text-text">
              {headerTitle}
            </div>
            <div className="ui-pane-header-actions ml-auto">
              {RIGHT_PANEL_TABS.map(({ tab, label, Icon }) => (
                <Tooltip key={tab} content={label}>
                  <button
                    type="button"
                    aria-label={label}
                    aria-pressed={activeTab === tab}
                    onClick={() => onTabChange(tab)}
                    className={cn(
                      "ui-focus-ring inline-flex h-[var(--ui-control-height-compact)] w-[var(--ui-control-height-compact)] items-center justify-center rounded-[var(--ui-radius-md)] transition-colors",
                      activeTab === tab
                        ? "bg-bg-muted text-text"
                        : "text-text-muted hover:bg-bg-muted hover:text-text",
                    )}
                  >
                    <Icon className="h-4 w-4 stroke-[1.7]" />
                  </button>
                </Tooltip>
              ))}
            </div>
          </div>

          {activeTab === "outline" ? (
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
                            ? "bg-bg-muted text-text"
                            : "text-text-muted hover:bg-bg-muted hover:text-text",
                        )}
                        style={{ paddingLeft: `${item.level * 10}px` }}
                      >
                        <span className="line-clamp-2 break-words">{item.text}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : panelHydrated || !hasNote ? (
            <RightPanelAssistant {...assistantProps} />
          ) : (
            <PanelEmptyState
              icon={<Sparkles />}
              message="Preparing assistant..."
            />
          )}
        </div>
      </div>
    </div>
  );
}

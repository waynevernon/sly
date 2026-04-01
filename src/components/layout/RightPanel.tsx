import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Editor as TiptapEditor } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import { cn } from "../../lib/utils";
import {
  extractOutlineItems,
  findActiveOutlineFromHeadingTops,
  findActiveOutlineFromSelection,
  type OutlineItem,
} from "./rightPanelOutline";

type RightPanelTab = "outline";

interface RightPanelProps {
  editor: TiptapEditor | null;
  scrollContainer: HTMLDivElement | null;
  hasNote: boolean;
  visible: boolean;
  width: number;
  onWidthChange: (width: number) => void;
}

const ACTIVE_HEADING_TOP_OFFSET = 72;

export function RightPanel({
  editor,
  scrollContainer,
  hasNote,
  visible,
  width,
  onWidthChange,
}: RightPanelProps) {
  const [activeTab] = useState<RightPanelTab>("outline");
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
  outlineItemsRef.current = outlineItems;
  liveWidthRef.current = liveWidth;

  useEffect(() => {
    if (!isResizing) {
      setLiveWidth(width);
    }
  }, [width, isResizing]);

  const updateOutline = useCallback(() => {
    if (!editor) {
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
    setActiveOutlineId(activeFromSelection?.id ?? null);
  }, [editor]);

  const updateActiveFromSelection = useCallback(() => {
    if (!editor) {
      setActiveOutlineId(null);
      return;
    }

    const active = findActiveOutlineFromSelection(
      outlineItemsRef.current,
      editor.state.selection.from,
    );
    setActiveOutlineId(active?.id ?? null);
  }, [editor]);

  const updateActiveFromViewport = useCallback(() => {
    if (!editor || !scrollContainer || outlineItemsRef.current.length === 0) {
      return;
    }

    const containerRect = scrollContainer.getBoundingClientRect();
    const thresholdTop = containerRect.top + ACTIVE_HEADING_TOP_OFFSET;
    const headingTops = outlineItemsRef.current
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
  }, [editor, scrollContainer]);

  useEffect(() => {
    if (!editor) {
      setOutlineItems([]);
      setActiveOutlineId(null);
      return;
    }

    const handleUpdate = () => {
      updateOutline();
      requestAnimationFrame(() => {
        updateActiveFromViewport();
      });
    };

    const handleSelectionUpdate = () => {
      updateActiveFromSelection();
    };

    handleUpdate();
    editor.on("update", handleUpdate);
    editor.on("selectionUpdate", handleSelectionUpdate);

    return () => {
      editor.off("update", handleUpdate);
      editor.off("selectionUpdate", handleSelectionUpdate);
    };
  }, [editor, updateActiveFromSelection, updateActiveFromViewport, updateOutline]);

  useEffect(() => {
    if (!scrollContainer || !visible) return;

    const handleScroll = () => {
      updateActiveFromViewport();
    };

    handleScroll();
    scrollContainer.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      scrollContainer.removeEventListener("scroll", handleScroll);
    };
  }, [scrollContainer, updateActiveFromViewport, visible]);

  useEffect(() => {
    if (!visible || !activeOutlineId) return;

    const activeElement = outlineScrollRef.current?.querySelector<HTMLElement>(
      `[data-outline-id="${activeOutlineId}"]`,
    );
    activeElement?.scrollIntoView({ block: "nearest" });
  }, [activeOutlineId, visible]);

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
      const transaction = editor.state.tr
        .setSelection(TextSelection.create(editor.state.doc, selectionPos))
        .scrollIntoView();

      editor.view.dispatch(transaction);
      editor.commands.focus();
      setActiveOutlineId(item.id);
    },
    [editor],
  );

  const emptyState = useMemo(() => {
    if (!hasNote) {
      return "Open a note to see its outline.";
    }
    return "No section headings in this note yet.";
  }, [hasNote]);

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
        <div className="h-full flex flex-col">
          <div className="ui-pane-drag-region" data-tauri-drag-region></div>
          <div className="ui-pane-header border-border/80">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-medium text-text">
                {activeTab === "outline" ? "Outline" : ""}
              </h2>
            </div>
          </div>

          <div
            ref={outlineScrollRef}
            className="ui-scrollbar-overlay flex-1 overflow-y-auto px-2 py-2"
          >
            {outlineItems.length === 0 ? (
              <div className="px-2 py-3 text-xs text-text-muted">{emptyState}</div>
            ) : (
              <div className="space-y-0.5">
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
        </div>
      </div>
    </div>
  );
}

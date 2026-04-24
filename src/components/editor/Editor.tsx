import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useState,
  useMemo,
} from "react";
import { MoreHorizontal, TextSearch, WrapText } from "lucide-react";
import {
  EditorContent,
  type Editor as TiptapEditor,
} from "@tiptap/react";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { toast } from "sonner";
import { mod, alt, shift, isMac } from "../../lib/platform";
import type { AssistantSelectionSnapshot } from "../../lib/assistant";
import { useBlockMathPopover } from "./useBlockMathPopover";
import { useEditorDocumentLifecycle } from "./useEditorDocumentLifecycle";
import { useEditorSearch } from "./useEditorSearch";
import { isAllowedUrlScheme, normalizeUrl } from "./linkUtils";
import { shouldParseMarkdownPaste } from "./markdownPaste";
import { isAddLinkShortcut } from "./shortcutUtils";
import { useLinkPopover } from "./useLinkPopover";
import { useTableContextMenu } from "./useTableContextMenu";
import { computeFormatBarLayout } from "./formatBarLayout";
import {
  MarkdownSourceEditor,
  type MarkdownSourceEditorHandle,
} from "./MarkdownSourceEditor";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useOptionalNotes } from "../../context/NotesContext";
import { useTheme } from "../../context/ThemeContext";
import { shouldShowPendingSelectionSpinner } from "./editorState";
import { SearchToolbar } from "./SearchToolbar";
import type { WikilinkStorage } from "./Wikilink";
import { EditorWidthHandles } from "./EditorWidthHandle";
import {
  persistedSelectionHighlightPluginKey,
  type SlyEditorPasteHandler,
  useSlyEditor,
} from "./useSlyEditor";
import { cn } from "../../lib/utils";
import { plainTextFromMarkdown } from "../../lib/plainText";
import {
  Button,
  IconButton,
  LoadingSpinner,
  PanelEmptyState,
  ToolbarButton,
  Tooltip,
  menuItemClassName,
  menuSeparatorClassName,
  menuSurfaceClassName,
} from "../ui";
import * as notesService from "../../services/notes";
import { downloadPdf, downloadMarkdown } from "../../services/pdf";
import type { NoteMetadata, PaneMode, Settings } from "../../types/note";
import {
  BoldIcon,
  ItalicIcon,
  StrikethroughIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  Heading4Icon,
  ListIcon,
  ListOrderedIcon,
  CheckSquareIcon,
  QuoteIcon,
  CodeIcon,
  InlineCodeIcon,
  BlockMathIcon,
  SeparatorIcon,
  LinkIcon,
  BracketsIcon,
  ImageIcon,
  TableIcon,
  CircleCheckIcon,
  CopyIcon,
  DownloadIcon,
  ShareIcon,
  RefreshCwIcon,
  PinIcon,
  MarkdownIcon,
  MarkdownOffIcon,
  FolderPlusIcon,
  NoteIcon,
} from "../icons";
import { EditorFilenameField } from "./EditorFilenameField";

function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function focusAndSelectTitle(editor: TiptapEditor): boolean {
  let titleFrom = -1;
  let titleTo = -1;

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "heading" || node.attrs.level !== 1) {
      return true;
    }
    titleFrom = pos + 1;
    titleTo = pos + node.nodeSize - 1;
    return false;
  });

  if (titleFrom < 0 || titleTo < 0) return false;

  editor
    .chain()
    .focus()
    .setTextSelection(titleFrom === titleTo ? titleFrom : { from: titleFrom, to: titleTo })
    .run();

  return true;
}

function selectionIsInsideH1(editor: TiptapEditor): boolean {
  const { selection, doc } = editor.state;
  let insideHeading = false;

  doc.nodesBetween(selection.from, selection.to, (node) => {
    if (node.type.name === "heading" && node.attrs.level === 1) {
      insideHeading = true;
      return false;
    }
    return true;
  });

  return insideHeading;
}

function truncateNoteTitle(title: string): string {
  return Array.from(title).slice(0, 50).join("");
}

function deriveNoteTitleFromEditor(editor: TiptapEditor): string {
  const { doc } = editor.state;

  for (let index = 0; index < doc.childCount; index += 1) {
    const node = doc.child(index);
    if (node.type.name === "frontmatter") {
      continue;
    }

    const text = node.textContent.trim();
    if (!text) {
      continue;
    }

    if (node.type.name === "heading" && node.attrs.level === 1) {
      return truncateNoteTitle(text);
    }

    return truncateNoteTitle(text);
  }

  return "Untitled";
}

// Standard number-field shortcuts for KaTeX (shared between inline and block math)
const katexMacros: Record<string, string> = {
  "\\R": "\\mathbb{R}",
  "\\N": "\\mathbb{N}",
  "\\Z": "\\mathbb{Z}",
  "\\Q": "\\mathbb{Q}",
  "\\C": "\\mathbb{C}",
};

// GridPicker component for table insertion
interface GridPickerProps {
  onSelect: (rows: number, cols: number) => void;
}

function GridPicker({ onSelect }: GridPickerProps) {
  const [hovered, setHovered] = useState({ row: 3, col: 3 });

  return (
    <>
      <div className="grid grid-cols-5 gap-1">
        {Array.from({ length: 25 }).map((_, i) => {
          const row = Math.floor(i / 5) + 1;
          const col = (i % 5) + 1;
          const isHighlighted = row <= hovered.row && col <= hovered.col;

          return (
            <div
              key={i}
              className={cn(
                "w-5.5 h-5.5 border rounded cursor-pointer transition-colors",
                isHighlighted
                  ? "bg-accent/20 border-accent/50"
                  : "border-border hover:border-accent/50",
              )}
              onMouseEnter={() => setHovered({ row, col })}
              onClick={() => onSelect(row, col)}
            />
          );
        })}
      </div>
      <p className="text-xs text-center mt-2 text-text-muted">
        {hovered.row} × {hovered.col} table
      </p>
    </>
  );
}

interface FormatBarProps {
  editor: TiptapEditor | null;
  onAddLink: () => void;
  onAddBlockMath: () => void;
  onAddImage: () => void;
}

// FormatBar must re-render with parent to reflect editor.isActive() state changes
// (editor instance is mutable, so memo would cause stale active states)
function FormatBar({
  editor,
  onAddLink,
  onAddBlockMath,
  onAddImage,
}: FormatBarProps) {
  const [tableMenuOpen, setTableMenuOpen] = useState(false);
  const [overflowMenuOpen, setOverflowMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRowRef = useRef<HTMLDivElement>(null);
  const overflowMeasureRef = useRef<HTMLDivElement>(null);
  const [layoutMetrics, setLayoutMetrics] = useState<{
    availableWidth: number;
    gap: number;
    overflowTriggerWidth: number;
    slotWidths: Record<string, number>;
  } | null>(null);

  type Slot =
    | { kind: "button"; key: string; toolbarEl: ReactNode; menuEl: ReactNode }
    | { kind: "table"; key: string }
    | { kind: "sep"; key: string };

  const allSlots: Slot[] = editor ? [
    {
      kind: "button", key: "bold",
      toolbarEl: <ToolbarButton key="bold" onClick={() => editor.chain().focus().toggleBold().run()} isActive={editor.isActive("bold")} title={`Bold (${mod}${isMac ? "" : "+"}B)`}><BoldIcon className="w-4.5 h-4.5 stroke-[1.5]" /></ToolbarButton>,
      menuEl: <DropdownMenu.Item key="bold" className={menuItemClassName} onSelect={() => editor.chain().focus().toggleBold().run()}><BoldIcon className="w-4 h-4 stroke-[1.5]" />Bold</DropdownMenu.Item>,
    },
    {
      kind: "button", key: "italic",
      toolbarEl: <ToolbarButton key="italic" onClick={() => editor.chain().focus().toggleItalic().run()} isActive={editor.isActive("italic")} title={`Italic (${mod}${isMac ? "" : "+"}I)`}><ItalicIcon className="w-4.5 h-4.5 stroke-[1.5]" /></ToolbarButton>,
      menuEl: <DropdownMenu.Item key="italic" className={menuItemClassName} onSelect={() => editor.chain().focus().toggleItalic().run()}><ItalicIcon className="w-4 h-4 stroke-[1.5]" />Italic</DropdownMenu.Item>,
    },
    {
      kind: "button", key: "strike",
      toolbarEl: <ToolbarButton key="strike" onClick={() => editor.chain().focus().toggleStrike().run()} isActive={editor.isActive("strike")} title={`Strikethrough (${mod}${isMac ? "" : "+"}${shift}${isMac ? "" : "+"}S)`}><StrikethroughIcon className="w-4.5 h-4.5 stroke-[1.5]" /></ToolbarButton>,
      menuEl: <DropdownMenu.Item key="strike" className={menuItemClassName} onSelect={() => editor.chain().focus().toggleStrike().run()}><StrikethroughIcon className="w-4 h-4 stroke-[1.5]" />Strikethrough</DropdownMenu.Item>,
    },
    { kind: "sep", key: "sep-1" },
    {
      kind: "button", key: "h1",
      toolbarEl: <ToolbarButton key="h1" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} isActive={editor.isActive("heading", { level: 1 })} title={`Heading 1 (${mod}${isMac ? "" : "+"}${alt}${isMac ? "" : "+"}1)`}><Heading1Icon className="w-4.5 h-4.5 stroke-[1.5]" /></ToolbarButton>,
      menuEl: <DropdownMenu.Item key="h1" className={menuItemClassName} onSelect={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1Icon className="w-4 h-4 stroke-[1.5]" />Heading 1</DropdownMenu.Item>,
    },
    {
      kind: "button", key: "h2",
      toolbarEl: <ToolbarButton key="h2" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} isActive={editor.isActive("heading", { level: 2 })} title={`Heading 2 (${mod}${isMac ? "" : "+"}${alt}${isMac ? "" : "+"}2)`}><Heading2Icon className="w-4.5 h-4.5 stroke-[1.5]" /></ToolbarButton>,
      menuEl: <DropdownMenu.Item key="h2" className={menuItemClassName} onSelect={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2Icon className="w-4 h-4 stroke-[1.5]" />Heading 2</DropdownMenu.Item>,
    },
    {
      kind: "button", key: "h3",
      toolbarEl: <ToolbarButton key="h3" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} isActive={editor.isActive("heading", { level: 3 })} title={`Heading 3 (${mod}${isMac ? "" : "+"}${alt}${isMac ? "" : "+"}3)`}><Heading3Icon className="w-4.5 h-4.5 stroke-[1.5]" /></ToolbarButton>,
      menuEl: <DropdownMenu.Item key="h3" className={menuItemClassName} onSelect={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3Icon className="w-4 h-4 stroke-[1.5]" />Heading 3</DropdownMenu.Item>,
    },
    {
      kind: "button", key: "h4",
      toolbarEl: <ToolbarButton key="h4" onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()} isActive={editor.isActive("heading", { level: 4 })} title={`Heading 4 (${mod}${isMac ? "" : "+"}${alt}${isMac ? "" : "+"}4)`}><Heading4Icon className="w-4.5 h-4.5 stroke-[1.5]" /></ToolbarButton>,
      menuEl: <DropdownMenu.Item key="h4" className={menuItemClassName} onSelect={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}><Heading4Icon className="w-4 h-4 stroke-[1.5]" />Heading 4</DropdownMenu.Item>,
    },
    { kind: "sep", key: "sep-2" },
    {
      kind: "button", key: "bulletList",
      toolbarEl: <ToolbarButton key="bulletList" onClick={() => editor.chain().focus().toggleBulletList().run()} isActive={editor.isActive("bulletList")} title={`Bullet list (${mod}${isMac ? "" : "+"}${shift}${isMac ? "" : "+"}8)`}><ListIcon className="w-4.5 h-4.5 stroke-[1.5]" /></ToolbarButton>,
      menuEl: <DropdownMenu.Item key="bulletList" className={menuItemClassName} onSelect={() => editor.chain().focus().toggleBulletList().run()}><ListIcon className="w-4 h-4 stroke-[1.5]" />Bullet List</DropdownMenu.Item>,
    },
    {
      kind: "button", key: "orderedList",
      toolbarEl: <ToolbarButton key="orderedList" onClick={() => editor.chain().focus().toggleOrderedList().run()} isActive={editor.isActive("orderedList")} title={`Numbered list (${mod}${isMac ? "" : "+"}${shift}${isMac ? "" : "+"}7)`}><ListOrderedIcon className="w-4.5 h-4.5 stroke-[1.5]" /></ToolbarButton>,
      menuEl: <DropdownMenu.Item key="orderedList" className={menuItemClassName} onSelect={() => editor.chain().focus().toggleOrderedList().run()}><ListOrderedIcon className="w-4 h-4 stroke-[1.5]" />Numbered List</DropdownMenu.Item>,
    },
    {
      kind: "button", key: "taskList",
      toolbarEl: <ToolbarButton key="taskList" onClick={() => editor.chain().focus().toggleTaskList().run()} isActive={editor.isActive("taskList")} title="Task list"><CheckSquareIcon className="w-4.5 h-4.5 stroke-[1.5]" /></ToolbarButton>,
      menuEl: <DropdownMenu.Item key="taskList" className={menuItemClassName} onSelect={() => editor.chain().focus().toggleTaskList().run()}><CheckSquareIcon className="w-4 h-4 stroke-[1.5]" />Task List</DropdownMenu.Item>,
    },
    {
      kind: "button", key: "blockquote",
      toolbarEl: <ToolbarButton key="blockquote" onClick={() => editor.chain().focus().toggleBlockquote().run()} isActive={editor.isActive("blockquote")} title={`Blockquote (${mod}${isMac ? "" : "+"}${shift}${isMac ? "" : "+"}B)`}><QuoteIcon className="w-4.5 h-4.5 stroke-[1.5]" /></ToolbarButton>,
      menuEl: <DropdownMenu.Item key="blockquote" className={menuItemClassName} onSelect={() => editor.chain().focus().toggleBlockquote().run()}><QuoteIcon className="w-4 h-4 stroke-[1.5]" />Blockquote</DropdownMenu.Item>,
    },
    {
      kind: "button", key: "inlineCode",
      toolbarEl: <ToolbarButton key="inlineCode" onClick={() => editor.chain().focus().toggleCode().run()} isActive={editor.isActive("code")} title={`Inline code (${mod}${isMac ? "" : "+"}E)`}><InlineCodeIcon className="w-4.5 h-4.5 stroke-[1.5]" /></ToolbarButton>,
      menuEl: <DropdownMenu.Item key="inlineCode" className={menuItemClassName} onSelect={() => editor.chain().focus().toggleCode().run()}><InlineCodeIcon className="w-4 h-4 stroke-[1.5]" />Inline Code</DropdownMenu.Item>,
    },
    {
      kind: "button", key: "codeBlock",
      toolbarEl: <ToolbarButton key="codeBlock" onClick={() => editor.chain().focus().toggleCodeBlock().run()} isActive={editor.isActive("codeBlock")} title={`Code block (${mod}${isMac ? "" : "+"}${alt}${isMac ? "" : "+"}C)`}><CodeIcon className="w-4.5 h-4.5 stroke-[1.5]" /></ToolbarButton>,
      menuEl: <DropdownMenu.Item key="codeBlock" className={menuItemClassName} onSelect={() => editor.chain().focus().toggleCodeBlock().run()}><CodeIcon className="w-4 h-4 stroke-[1.5]" />Code Block</DropdownMenu.Item>,
    },
    {
      kind: "button", key: "blockMath",
      toolbarEl: <ToolbarButton key="blockMath" onClick={onAddBlockMath} isActive={editor.isActive("blockMath")} title="Block math"><BlockMathIcon className="w-4.5 h-4.5 stroke-[1.5]" /></ToolbarButton>,
      menuEl: <DropdownMenu.Item key="blockMath" className={menuItemClassName} onSelect={onAddBlockMath}><BlockMathIcon className="w-4 h-4 stroke-[1.5]" />Block Math</DropdownMenu.Item>,
    },
    {
      kind: "button", key: "hRule",
      toolbarEl: <ToolbarButton key="hRule" onClick={() => editor.chain().focus().setHorizontalRule().run()} isActive={false} title="Horizontal rule"><SeparatorIcon /></ToolbarButton>,
      menuEl: <DropdownMenu.Item key="hRule" className={menuItemClassName} onSelect={() => editor.chain().focus().setHorizontalRule().run()}><SeparatorIcon />Horizontal Rule</DropdownMenu.Item>,
    },
    { kind: "sep", key: "sep-3" },
    {
      kind: "button", key: "link",
      toolbarEl: <ToolbarButton key="link" onClick={onAddLink} isActive={editor.isActive("link")} title={`Add link (${mod}${isMac ? "" : "+"}K)`}><LinkIcon className="w-4.5 h-4.5 stroke-[1.5]" /></ToolbarButton>,
      menuEl: <DropdownMenu.Item key="link" className={menuItemClassName} onSelect={onAddLink}><LinkIcon className="w-4 h-4 stroke-[1.5]" />Add Link</DropdownMenu.Item>,
    },
    {
      kind: "button", key: "wikilink",
      toolbarEl: <ToolbarButton key="wikilink" onClick={() => editor.chain().focus().insertContent("[[").run()} isActive={false} title="Insert wikilink"><BracketsIcon className="w-4.5 h-4.5 stroke-[1.5]" /></ToolbarButton>,
      menuEl: <DropdownMenu.Item key="wikilink" className={menuItemClassName} onSelect={() => editor.chain().focus().insertContent("[[").run()}><BracketsIcon className="w-4 h-4 stroke-[1.5]" />Wikilink</DropdownMenu.Item>,
    },
    {
      kind: "button", key: "image",
      toolbarEl: <ToolbarButton key="image" onClick={onAddImage} isActive={false} title="Add image"><ImageIcon className="w-4.5 h-4.5 stroke-[1.5]" /></ToolbarButton>,
      menuEl: <DropdownMenu.Item key="image" className={menuItemClassName} onSelect={onAddImage}><ImageIcon className="w-4 h-4 stroke-[1.5]" />Image</DropdownMenu.Item>,
    },
    { kind: "table", key: "table" },
  ] : [];

  useLayoutEffect(() => {
    const containerEl = containerRef.current;
    const measureRowEl = measureRowRef.current;
    const overflowMeasureEl = overflowMeasureRef.current;
    if (!containerEl || !measureRowEl || !overflowMeasureEl) return;

    const updateLayoutMetrics = () => {
      const containerStyles = window.getComputedStyle(containerEl);
      const availableWidth = Math.max(
        0,
        containerEl.clientWidth
          - Number.parseFloat(containerStyles.paddingLeft || "0")
          - Number.parseFloat(containerStyles.paddingRight || "0"),
      );
      const measureStyles = window.getComputedStyle(measureRowEl);
      const gap = Number.parseFloat(measureStyles.columnGap || measureStyles.gap || "0");
      const slotWidths: Record<string, number> = {};

      Array.from(measureRowEl.children).forEach((child) => {
        if (!(child instanceof HTMLElement)) return;
        const slotKey = child.dataset.slotKey;
        if (!slotKey) return;
        slotWidths[slotKey] = child.offsetWidth;
      });

      setLayoutMetrics((previous) => {
        const overflowTriggerWidth = overflowMeasureEl.offsetWidth;

        if (
          previous &&
          previous.availableWidth === availableWidth &&
          previous.gap === gap &&
          previous.overflowTriggerWidth === overflowTriggerWidth &&
          Object.keys(previous.slotWidths).length === Object.keys(slotWidths).length &&
          Object.entries(slotWidths).every(
            ([key, width]) => previous.slotWidths[key] === width,
          )
        ) {
          return previous;
        }

        return {
          availableWidth,
          gap,
          overflowTriggerWidth,
          slotWidths,
        };
      });
    };

    updateLayoutMetrics();

    const observer = new ResizeObserver(() => {
      updateLayoutMetrics();
    });

    observer.observe(containerEl);
    observer.observe(measureRowEl);
    observer.observe(overflowMeasureEl);

    return () => observer.disconnect();
  }, [allSlots.length]);

  // Compute overflow split
  const { allFit, splitAt } = layoutMetrics
    ? computeFormatBarLayout({
        slots: allSlots,
        slotWidths: layoutMetrics.slotWidths,
        availableWidth: layoutMetrics.availableWidth,
        overflowTriggerWidth: layoutMetrics.overflowTriggerWidth,
        gap: layoutMetrics.gap,
      })
    : { allFit: true, splitAt: allSlots.length };

  const visibleSlots = allFit ? allSlots : allSlots.slice(0, splitAt);
  const overflowSlots = allFit ? [] : allSlots.slice(splitAt);

  // Strip trailing separators from visible list
  while (visibleSlots.length > 0 && visibleSlots[visibleSlots.length - 1].kind === "sep") {
    visibleSlots.pop();
  }

  if (!editor) return null;

  return (
    <div ref={containerRef} className="relative flex items-center gap-1 px-4 overflow-hidden flex-1 min-w-0">
      <div
        ref={measureRowRef}
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 invisible flex w-max items-center gap-1 px-4"
      >
        {allSlots.map((slot) => (
          <div key={slot.key} data-slot-key={slot.key} className="shrink-0">
            {slot.kind === "sep" ? (
              <div className="w-px h-4.5 border-l border-border mx-2 shrink-0" />
            ) : (
              <ToolbarButton isActive={false}>
                {slot.kind === "table" ? (
                  <TableIcon className="w-4.5 h-4.5 stroke-[1.5]" />
                ) : (
                  <MoreHorizontal className="w-4.5 h-4.5 stroke-[1.5] opacity-0" />
                )}
              </ToolbarButton>
            )}
          </div>
        ))}
      </div>
      <div
        ref={overflowMeasureRef}
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 invisible"
      >
        <ToolbarButton isActive={false}>
          <MoreHorizontal className="w-4.5 h-4.5 stroke-[1.5]" />
        </ToolbarButton>
      </div>
      {visibleSlots.map((slot) => {
        if (slot.kind === "sep") {
          return <div key={slot.key} className="w-px h-4.5 border-l border-border mx-2 shrink-0" />;
        }
        if (slot.kind === "table") {
          return (
            <DropdownMenu.Root key={slot.key} open={tableMenuOpen} onOpenChange={setTableMenuOpen}>
              <Tooltip content="Insert table">
                <DropdownMenu.Trigger asChild>
                  <ToolbarButton isActive={editor.isActive("table")}>
                    <TableIcon className="w-4.5 h-4.5 stroke-[1.5]" />
                  </ToolbarButton>
                </DropdownMenu.Trigger>
              </Tooltip>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  className="ui-surface-popover z-50 p-2.5"
                  onCloseAutoFocus={(e) => e.preventDefault()}
                >
                  <GridPicker
                    onSelect={(rows, cols) => {
                      editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
                      setTableMenuOpen(false);
                    }}
                  />
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          );
        }
        return slot.toolbarEl;
      })}
      {overflowSlots.length > 0 && (
        <DropdownMenu.Root open={overflowMenuOpen} onOpenChange={setOverflowMenuOpen}>
          <Tooltip content="More">
            <DropdownMenu.Trigger asChild>
              <ToolbarButton isActive={false}>
                <MoreHorizontal className="w-4.5 h-4.5 stroke-[1.5]" />
              </ToolbarButton>
            </DropdownMenu.Trigger>
          </Tooltip>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className={`${menuSurfaceClassName} min-w-40 z-50`}
              sideOffset={5}
              align="start"
              onCloseAutoFocus={(e) => e.preventDefault()}
            >
              {overflowSlots.map((slot, idx) => {
                if (slot.kind === "sep") {
                  const prevContent = overflowSlots.slice(0, idx).some(s => s.kind !== "sep");
                  const nextContent = overflowSlots.slice(idx + 1).some(s => s.kind !== "sep");
                  if (!prevContent || !nextContent) return null;
                  return <DropdownMenu.Separator key={slot.key} className={menuSeparatorClassName} />;
                }
                if (slot.kind === "table") {
                  return (
                    <DropdownMenu.Sub key={slot.key}>
                      <DropdownMenu.SubTrigger className={menuItemClassName}>
                        <TableIcon className="w-4 h-4 stroke-[1.5]" />
                        Insert Table
                      </DropdownMenu.SubTrigger>
                      <DropdownMenu.Portal>
                        <DropdownMenu.SubContent className="ui-surface-popover z-50 p-2.5">
                          <GridPicker
                            onSelect={(rows, cols) => {
                              editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
                              setOverflowMenuOpen(false);
                            }}
                          />
                        </DropdownMenu.SubContent>
                      </DropdownMenu.Portal>
                    </DropdownMenu.Sub>
                  );
                }
                return slot.menuEl;
              })}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      )}
    </div>
  );
}

// Data source for preview mode — bypasses NotesContext
export interface PreviewModeData {
  content: string | null;
  title: string;
  filePath: string;
  notesFolder: string | null;
  modified: number;
  hasExternalChanges: boolean;
  reloadVersion: number;
  save: (content: string) => Promise<void>;
  reload: () => Promise<void>;
}

export interface WorkspaceEditorData {
  currentNote: {
    id: string;
    title: string;
    content: string;
    path: string;
    modified: number;
  } | null;
  notesFolder: string | null;
  selectedNoteId: string | null;
  notes: NoteMetadata[];
  hasExternalChanges: boolean;
  reloadVersion: number;
  saveNote: (content: string, noteId?: string) => Promise<void>;
  renameNote: (noteId: string, newName: string) => Promise<{ id: string }>;
  reloadCurrentNote: () => Promise<void>;
  createNote: () => Promise<void>;
  consumePendingNewNote: (id: string) => boolean;
  pinNote: ((id: string) => Promise<void>) | undefined;
  unpinNote: ((id: string) => Promise<void>) | undefined;
  selectNote: ((id: string) => Promise<void>) | undefined;
}

interface EditorProps {
  paneMode?: PaneMode;
  focusMode?: boolean;
  hasPinnedRightTitlebarControl?: boolean;
  printMode?: boolean;
  previewMode?: PreviewModeData;
  showPinControl?: boolean;
  onEditorReady?: (editor: TiptapEditor | null) => void;
  onSourceModeChange?: (sourceMode: boolean) => void;
  onRegisterScrollContainer?: (container: HTMLDivElement | null) => void;
  onRegisterFlushPendingSave?: (
    flushPendingSave: (() => Promise<void>) | null,
  ) => void;
  assistantSelection?: AssistantSelectionSnapshot | null;
  workspaceMode?: WorkspaceEditorData;
  onSaveToFolder?: () => void;
  saveToFolderDisabled?: boolean;
}

interface EditorImplProps extends EditorProps {
  fallbackNotesCtx: ReturnType<typeof useOptionalNotes> | null;
}

function ContextBackedEditor(props: EditorProps) {
  const notesCtx = useOptionalNotes();
  return <EditorImpl {...props} fallbackNotesCtx={notesCtx} />;
}

export function Editor(props: EditorProps) {
  if (props.workspaceMode || props.previewMode) {
    return <EditorImpl {...props} fallbackNotesCtx={null} />;
  }

  return <ContextBackedEditor {...props} />;
}

function EditorImpl({
  paneMode = 2,
  focusMode,
  printMode = false,
  showPinControl = true,
  onEditorReady,
  onSourceModeChange,
  onRegisterScrollContainer,
  onRegisterFlushPendingSave,
  assistantSelection,
  previewMode,
  workspaceMode,
  onSaveToFolder,
  saveToFolderDisabled,
  fallbackNotesCtx,
}: EditorImplProps) {
  const notesCtx = fallbackNotesCtx;

  const currentNote = useMemo(() => {
    if (workspaceMode) {
      return workspaceMode.currentNote;
    }
    if (!previewMode) return notesCtx?.currentNote ?? null;
    if (previewMode.content === null) return null;
    return {
      id: previewMode.filePath,
      title: previewMode.title,
      content: previewMode.content,
      path: previewMode.filePath,
      modified: previewMode.modified,
    };
  }, [previewMode, workspaceMode, notesCtx?.currentNote]);

  const saveNote = useMemo(
    () =>
      previewMode
        ? async (content: string, _noteId?: string) => {
            await previewMode.save(content);
          }
        : workspaceMode
          ? workspaceMode.saveNote
          : notesCtx!.saveNote,
    [previewMode, workspaceMode, notesCtx]
  );
  const renameNote = workspaceMode?.renameNote ?? notesCtx?.renameNote;
  const notesFolder =
    previewMode?.notesFolder ??
    workspaceMode?.notesFolder ??
    notesCtx?.notesFolder ??
    null;

  const createNote = workspaceMode?.createNote ?? notesCtx?.createNote;
  const consumePendingNewNote =
    workspaceMode?.consumePendingNewNote ?? notesCtx?.consumePendingNewNote;
  const hasExternalChanges = previewMode
    ? previewMode.hasExternalChanges
    : workspaceMode
      ? workspaceMode.hasExternalChanges
      : notesCtx!.hasExternalChanges;
  const reloadCurrentNote = previewMode
    ? previewMode.reload
    : workspaceMode
      ? workspaceMode.reloadCurrentNote
      : notesCtx!.reloadCurrentNote;
  const reloadVersion = previewMode
    ? previewMode.reloadVersion
    : workspaceMode
      ? workspaceMode.reloadVersion
      : notesCtx!.reloadVersion;
  const pinNote = workspaceMode?.pinNote ?? notesCtx?.pinNote;
  const unpinNote = workspaceMode?.unpinNote ?? notesCtx?.unpinNote;
  const notes = workspaceMode?.notes ?? notesCtx?.notes;
  const selectedNoteId =
    workspaceMode?.selectedNoteId ?? notesCtx?.selectedNoteId ?? null;
  const showPendingSelectionSpinner = shouldShowPendingSelectionSpinner(
    selectedNoteId,
    notes,
  );
  const {
    sourceModeWordWrap,
    setSourceModeWordWrap,
    textDirection,
  } = useTheme();
  const [sourceModeSyntaxHighlight, setSourceModeSyntaxHighlight] = useState(true);
  const [editorReady, setEditorReady] = useState(false);
  // Force re-render when selection changes to update toolbar active states
  const [, setSelectionKey] = useState(0);
  const [copyMenuOpen, setCopyMenuOpen] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [documentTitle, setDocumentTitle] = useState(
    currentNote?.title ?? "Untitled",
  );
  const [filenameFocusRequestToken, setFilenameFocusRequestToken] = useState(0);
  const [pendingFilenameEditNoteId, setPendingFilenameEditNoteId] = useState<string | null>(null);
  // Delay transition classes until after initial mount to avoid format bar height animation on note load
  const [hasTransitioned, setHasTransitioned] = useState(false);
  useEffect(() => {
    if (!hasTransitioned && currentNote) {
      const id = requestAnimationFrame(() => setHasTransitioned(true));
      return () => cancelAnimationFrame(id);
    }
  }, [hasTransitioned, currentNote]);

  const effectivePaneMode = focusMode ? 1 : paneMode;
  const navigationVisible = effectivePaneMode > 1;
  const needsPaneDelay = focusMode && paneMode > 1;

  const sourceEditorRef = useRef<MarkdownSourceEditorHandle | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<TiptapEditor | null>(null);
  const currentNoteIdRef = useRef<string | null>(null);
  const closeBlockMathPopoverRef = useRef<() => void>(() => {});
  const closeLinkPopoverRef = useRef<() => void>(() => {});
  // Stable refs for wikilink click handler (avoids re-registering listener on every notes change)
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const selectNoteRef = useRef(workspaceMode?.selectNote ?? notesCtx?.selectNote);
  selectNoteRef.current = workspaceMode?.selectNote ?? notesCtx?.selectNote;

  // Keep ref in sync with current note ID
  currentNoteIdRef.current = currentNote?.id ?? null;

  // Load settings when note changes or notes are refreshed (e.g., after pin/unpin)
  useEffect(() => {
    if (currentNote?.id && !previewMode) {
      notesService
        .getSettings()
        .then(setSettings)
        .catch((error) => {
          console.error("Failed to load settings:", error);
        });
    }
  }, [currentNote?.id, notes, previewMode]);

  // Calculate if current note is pinned
  const isPinned =
    settings?.pinnedNoteIds?.includes(currentNote?.id || "") || false;

  const {
    effectiveSourceMode,
    finalizeProvisionalFilename,
    flushPendingSave,
    getMarkdown,
    handleSourceChange,
    isLoadingRef,
    isSaving,
    provisionalFilenameNoteIdRef,
    scheduleSave,
    sourceContent,
    toggleSourceMode,
  } = useEditorDocumentLifecycle({
    consumePendingNewNote,
    currentNote,
    currentNoteIdRef,
    onDocumentTitleChange: setDocumentTitle,
    editorReady,
    editorRef,
    focusAndSelectTitle,
    notesFolder,
    onRegisterFlushPendingSave,
    onSourceModeChange,
    printMode,
    reloadVersion,
    renameNote,
    saveNote,
    scrollContainerRef,
    sourceEditorRef,
  });

  const { closeLinkPopover, handleAddLink } = useLinkPopover({
    closeBlockMathPopover: () => closeBlockMathPopoverRef.current(),
    editorRef,
  });

  const { closeBlockMathPopover, handleAddBlockMath, handleEditBlockMath } =
    useBlockMathPopover({
      closeLinkPopover: () => closeLinkPopoverRef.current(),
      editorRef,
    });
  closeLinkPopoverRef.current = closeLinkPopover;
  closeBlockMathPopoverRef.current = closeBlockMathPopover;

  const handleEditorPaste = useCallback<SlyEditorPasteHandler>(
    (_view, event) => {
      const clipboardData = event.clipboardData;
      if (!clipboardData) return false;

      const items = Array.from(clipboardData.items);
      const imageItem = items.find((item) => item.type.startsWith("image/"));

      if (imageItem) {
        const blob = imageItem.getAsFile();
        if (blob) {
          const reader = new FileReader();
          reader.onload = async () => {
            const base64 = (reader.result as string).split(",")[1];

            try {
              const relativePath = await invoke<string>(
                "save_clipboard_image",
                { base64Data: base64 },
              );

              const notesFolder = await invoke<string>("get_notes_folder");
              const absolutePath = await join(notesFolder, relativePath);
              const assetUrl = convertFileSrc(absolutePath);

              editorRef.current
                ?.chain()
                .focus()
                .setImage({ src: assetUrl })
                .run();
            } catch (error) {
              console.error("Failed to paste image:", error);
              toast.error("Failed to paste image");
            }
          };
          reader.onerror = () => {
            console.error("Failed to read clipboard image:", reader.error);
            toast.error("Failed to read clipboard image");
          };
          reader.readAsDataURL(blob);
          return true;
        }
      }

      const text = clipboardData.getData("text/plain");
      if (!text) return false;

      const html = clipboardData.getData("text/html");
      if (!shouldParseMarkdownPaste({ html, text })) {
        return false;
      }

      const currentEditor = editorRef.current;
      if (!currentEditor) return false;

      try {
        if (currentEditor.commands.insertContent(text)) {
          return true;
        }
      } catch {
        // Fall back to default paste behavior.
      }

      return false;
    },
    [],
  );

  const handleAddImage = useCallback(async () => {
    const currentEditor = editorRef.current;
    if (!currentEditor) return;
    const selected = await openDialog({
      multiple: false,
      filters: [
        {
          name: "Images",
          extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg"],
        },
      ],
    });
    if (selected) {
      try {
        const relativePath = await invoke<string>("copy_image_to_assets", {
          sourcePath: selected as string,
        });

        const notesFolder = await invoke<string>("get_notes_folder");
        const absolutePath = await join(notesFolder, relativePath);
        const assetUrl = convertFileSrc(absolutePath);

        currentEditor.chain().focus().setImage({ src: assetUrl }).run();
      } catch (error) {
        console.error("Failed to add image:", error);
      }
    }
  }, []);

  const editor = useSlyEditor({
    editorRef,
    handleAddBlockMath,
    handleAddImage,
    handleEditBlockMath,
    handlePaste: handleEditorPaste,
    isLoadingRef,
    katexMacros,
    onCreate: () => setEditorReady(true),
    onDocumentChange: (editorInstance) => {
      setDocumentTitle(deriveNoteTitleFromEditor(editorInstance));
    },
    provisionalFilenameNoteIdRef,
    scheduleSave,
    selectionIsInsideH1,
    setSelectionKey,
    textDirection,
    finalizeProvisionalFilename,
  });

  // Notify parent component when editor is ready
  useEffect(() => {
    onEditorReady?.(editor);
  }, [editor, onEditorReady]);

  useEffect(() => {
    setDocumentTitle(currentNote?.title ?? "Untitled");
  }, [currentNote?.id, currentNote?.title]);

  useEffect(() => {
    const handleRequestFilenameEdit = (event: Event) => {
      const customEvent = event as CustomEvent<string | null>;
      if (!customEvent.detail) {
        return;
      }
      setPendingFilenameEditNoteId(customEvent.detail);
    };

    window.addEventListener("request-note-filename-edit", handleRequestFilenameEdit);
    return () =>
      window.removeEventListener("request-note-filename-edit", handleRequestFilenameEdit);
  }, []);

  useEffect(() => {
    if (
      !pendingFilenameEditNoteId ||
      !currentNote ||
      currentNote.id !== pendingFilenameEditNoteId
    ) {
      return;
    }

    setPendingFilenameEditNoteId(null);
    if (printMode || focusMode) {
      return;
    }

    setFilenameFocusRequestToken((token) => token + 1);
  }, [currentNote, focusMode, pendingFilenameEditNoteId, printMode]);

  useEffect(() => {
    onRegisterScrollContainer?.(scrollContainerRef.current);
    return () => {
      onRegisterScrollContainer?.(null);
    };
  }, [onRegisterScrollContainer]);

  const updatePersistedSelectionDecorations = useCallback(
    (
      selection: AssistantSelectionSnapshot | null | undefined,
      currentEditor: TiptapEditor | null,
    ) => {
      if (!currentEditor) {
        return;
      }

      const { state } = currentEditor;
      const from = selection ? Math.max(0, selection.from) : 0;
      const to = selection ? Math.min(selection.to, state.doc.content.size) : 0;
      const decorationSet =
        from < to
          ? DecorationSet.create(state.doc, [
              Decoration.inline(from, to, {
                class: "assistant-persisted-selection",
              }),
            ])
          : DecorationSet.empty;

      const tr = state.tr.setMeta(persistedSelectionHighlightPluginKey, {
        decorationSet,
      });
      currentEditor.view.dispatch(tr);
    },
    [],
  );

  useEffect(() => {
    updatePersistedSelectionDecorations(assistantSelection, editor);
  }, [assistantSelection, editor, updatePersistedSelectionDecorations]);

  // Sync notes list into editor storage for wikilink autocomplete
  useEffect(() => {
    if (!editor || !notes) return;
    const storage = (editor.storage as any).wikilink as
      | WikilinkStorage
      | undefined;
    if (storage) storage.notes = notes;
  }, [editor, notes]);

  const {
    clearSearch,
    currentMatchIndex,
    goToNextMatch,
    goToPreviousMatch,
    handleSearchChange,
    openEditorSearch,
    searchInputRef,
    searchMatches,
    searchOpen,
    searchQuery,
  } = useEditorSearch({
    currentNoteId: currentNote?.id ?? null,
    editor,
  });
  const { handleContextMenu } = useTableContextMenu({ editor });

  // Handle clicks on wikilinks and external links
  useEffect(() => {
    if (!editor) return;

    const handleEditorClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Check for wikilink click first (no modifier key required)
      const wikilinkEl = target.closest("[data-wikilink]");
      if (wikilinkEl) {
        e.preventDefault();
        const noteTitle = wikilinkEl.getAttribute("data-note-title");
        const currentNotes = notesRef.current;
        if (noteTitle && currentNotes) {
          const note = currentNotes.find(
            (n) => n.title.toLowerCase() === noteTitle.toLowerCase(),
          );
          if (note) {
            selectNoteRef.current?.(note.id);
          } else {
            toast.info(`Note "${noteTitle}" does not exist yet`);
          }
        }
        return;
      }

      // Prevent links from opening unless Cmd/Ctrl+Click
      const link = target.closest("a");
      if (link) {
        e.preventDefault();
        const rawHref = link.getAttribute("href") ?? "";
        const normalizedHref = normalizeUrl(rawHref);
        if ((e.metaKey || e.ctrlKey) && normalizedHref) {
          if (isAllowedUrlScheme(normalizedHref)) {
            openUrl(normalizedHref).catch((error) =>
              console.error("Failed to open link:", error),
            );
          } else {
            toast.error("Cannot open links with this URL scheme");
          }
        }
      }
    };

    const editorElement = editor.view.dom;
    editorElement.addEventListener("click", handleEditorClick);

    return () => {
      editorElement.removeEventListener("click", handleEditorClick);
    };
  }, [editor]);

  // Keyboard shortcut for Cmd+K to add link (only when editor is focused)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isAddLinkShortcut(e)) {
        // Only handle if we're in the editor
        const target = e.target as HTMLElement;
        const isInEditor = target.closest(".ProseMirror");
        if (isInEditor && editor) {
          e.preventDefault();
          handleAddLink();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleAddLink, editor]);

  // Keyboard shortcut for Cmd+Shift+C to open copy menu
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "c") {
        e.preventDefault();
        setCopyMenuOpen(true);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Cmd+F to open search (works when document/editor area is focused)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        e.key.toLowerCase() === "f"
      ) {
        if (!currentNote || !editor) return;

        const target = e.target as HTMLElement;
        const tagName = target.tagName.toLowerCase();

        // Don't intercept if user is in an input/textarea (except the editor itself)
        if (
          (tagName === "input" || tagName === "textarea") &&
          !target.closest(".ProseMirror")
        ) {
          return;
        }

        // Don't intercept if in sidebar
        if (target.closest('[class*="sidebar"]')) {
          return;
        }

        // Open search for the editor
        e.preventDefault();
        openEditorSearch();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [editor, currentNote, openEditorSearch]);

  // Copy handlers
  const handleCopyMarkdown = useCallback(async () => {
    if (!editor) return;
    try {
      const markdown = getMarkdown(editor);
      await invoke("copy_to_clipboard", { text: markdown });
      toast.success("Copied as Markdown");
    } catch (error) {
      console.error("Failed to copy markdown:", error);
      toast.error("Failed to copy");
    }
  }, [editor, getMarkdown]);

  const handleCopyPlainText = useCallback(async () => {
    if (!editor) return;
    try {
      const markdown = getMarkdown(editor);
      const plainText = plainTextFromMarkdown(markdown);
      await invoke("copy_to_clipboard", { text: plainText });
      toast.success("Copied as plain text");
    } catch (error) {
      console.error("Failed to copy plain text:", error);
      toast.error("Failed to copy");
    }
  }, [editor, getMarkdown]);

  const handleCopyHtml = useCallback(async () => {
    if (!editor) return;
    try {
      const html = editor.getHTML();
      await invoke("copy_to_clipboard", { text: html });
      toast.success("Copied as HTML");
    } catch (error) {
      console.error("Failed to copy HTML:", error);
      toast.error("Failed to copy");
    }
  }, [editor]);

  // Download handlers
  const handleDownloadPdf = useCallback(async () => {
    if (!currentNote) return;
    try {
      await flushPendingSave();
      await downloadPdf(currentNote.path);
    } catch (error) {
      console.error("Failed to open print dialog:", error);
      toast.error("Failed to open print dialog");
    }
  }, [currentNote, flushPendingSave]);

  const handleDownloadMarkdown = useCallback(async () => {
    if (!editor || !currentNote) return;
    try {
      const markdown = getMarkdown(editor);
      const saved = await downloadMarkdown(markdown, currentNote.title);
      if (saved) {
        toast.success("Markdown saved successfully");
      }
    } catch (error) {
      console.error("Failed to download markdown:", error);
      toast.error("Failed to save markdown");
    }
  }, [editor, currentNote, getMarkdown]);

  const handleRenameFromEditor = useCallback(
    async (nextName: string) => {
      if (!currentNote || !renameNote) {
        return;
      }

      try {
        await flushPendingSave();
        await renameNote(currentNote.id, nextName);
      } catch (error) {
        console.error("Failed to rename note file:", error);
        toast.error("Failed to rename file");
        throw error;
      }
    },
    [currentNote, flushPendingSave, renameNote],
  );

  // Listen for toggle-source-mode custom event (from App.tsx shortcut / command palette)
  useEffect(() => {
    const handler = () => toggleSourceMode();
    window.addEventListener("toggle-source-mode", handler);
    return () => window.removeEventListener("toggle-source-mode", handler);
  }, [toggleSourceMode]);

  if (!currentNote) {
    // Preview mode: show loading state (content not yet loaded)
    if (previewMode) {
      return (
        <div className="flex-1 flex flex-col bg-bg">
          {!printMode && (
            <>
              <div className="ui-pane-drag-region" data-tauri-drag-region></div>
              <div className="ui-pane-header" />
            </>
          )}
          <div className="flex-1 flex items-center justify-center">
            <LoadingSpinner size="xl" tone="muted" />
          </div>
        </div>
      );
    }

    // A note is selected but not yet loaded — show loading spinner to avoid empty state flash
    if (showPendingSelectionSpinner) {
      return (
        <div className="flex-1 flex flex-col bg-bg">
          <div className="ui-pane-drag-region" data-tauri-drag-region></div>
          <div className="ui-pane-header" />
          <div className="flex-1 flex items-center justify-center">
            <LoadingSpinner size="xl" tone="muted" />
          </div>
        </div>
      );
    }

    // Folder mode: show empty state with "New Note" button
    return (
      <div className="flex-1 flex flex-col bg-bg">
        <div className="ui-pane-drag-region" data-tauri-drag-region></div>
        <div className="ui-pane-header" />
        <PanelEmptyState
          icon={<NoteIcon />}
          title="Start writing"
          message="Open a note from the sidebar, or begin a new one here."
          action={
            createNote ? (
              <Button onClick={createNote} variant="secondary" size="md">
                New Note{" "}
                <span className="text-text-muted ml-1">
                  {mod}
                  {isMac ? "" : "+"}N
                </span>
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex-1 flex flex-col bg-bg overflow-hidden",
        printMode && "print-note-editor overflow-visible",
      )}
    >
      {!printMode && (
        <>
          {/* Drag region – window dragging only */}
          <div
            className={cn(
              "h-[var(--ui-drag-region-height)] shrink-0",
              !navigationVisible && "ui-titlebar-leading-offset",
            )}
            data-tauri-drag-region
          />

          {/* Header: format bar on the left, note actions on the right */}
          <div
            className={cn(
              "ui-pane-header px-0 border-border/80",
              focusMode && "border-transparent",
              hasTransitioned && `transition-[border-color] duration-[240ms]${needsPaneDelay ? " delay-200" : ""}`,
            )}
          >
            <div
              className={cn(
                "flex-1 min-w-0",
                focusMode ? "opacity-0 pointer-events-none" : "opacity-100",
                hasTransitioned && `transition-opacity duration-[240ms]${needsPaneDelay ? " delay-200" : ""}`,
              )}
            >
              {effectiveSourceMode ? (
                <div className="ui-scrollbar-overlay flex items-center gap-1 px-4 overflow-x-auto">
                  <ToolbarButton
                    onClick={() => setSourceModeWordWrap(!sourceModeWordWrap)}
                    isActive={sourceModeWordWrap}
                    title={sourceModeWordWrap ? "Turn Word Wrap Off" : "Turn Word Wrap On"}
                  >
                    <WrapText className="w-4.5 h-4.5 stroke-[1.5]" />
                  </ToolbarButton>
                  <ToolbarButton
                    onClick={() =>
                      setSourceModeSyntaxHighlight((enabled) => !enabled)
                    }
                    isActive={sourceModeSyntaxHighlight}
                    title={
                      sourceModeSyntaxHighlight
                        ? "Turn Syntax Highlighting Off"
                        : "Turn Syntax Highlighting On"
                    }
                  >
                    <CodeIcon className="w-4.5 h-4.5 stroke-[1.5]" />
                  </ToolbarButton>
                </div>
              ) : (
                <FormatBar
                  editor={editor}
                  onAddLink={handleAddLink}
                  onAddBlockMath={handleAddBlockMath}
                  onAddImage={handleAddImage}
                />
              )}
            </div>

            {/* Note actions */}
            <div
              className={cn(
                "flex items-center gap-px shrink-0",
                focusMode ? "opacity-0 pointer-events-none" : "opacity-100",
                hasTransitioned && `transition-opacity duration-[240ms]${needsPaneDelay ? " delay-200" : ""}`,
              )}
            >
              <div className="w-px h-4 border-l border-border/60 mx-1 shrink-0" />
              {hasExternalChanges ? (
                <Tooltip content={`External changes detected (${mod}${isMac ? "" : "+"}R to refresh)`}>
                  <button
                    onClick={reloadCurrentNote}
                    className="ui-focus-ring h-[var(--ui-control-height-compact)] rounded-[var(--ui-radius-md)] px-2.5 flex items-center gap-1.5 text-xs text-text-muted hover:bg-bg-muted hover:text-text transition-colors font-medium"
                  >
                    <RefreshCwIcon className="w-4 h-4 stroke-[1.6]" />
                    <span>Refresh</span>
                  </button>
                </Tooltip>
              ) : isSaving ? (
                <Tooltip content="Saving...">
                  <div className="h-[var(--ui-control-height-compact)] w-[var(--ui-control-height-compact)] flex items-center justify-center">
                    <LoadingSpinner size="lg" tone="subtle" />
                  </div>
                </Tooltip>
              ) : (
                <Tooltip content={`All changes saved${currentNote ? ` • ${formatDateTime(currentNote.modified)}` : ""}`}>
                  <div className="h-[var(--ui-control-height-compact)] w-[var(--ui-control-height-compact)] flex items-center justify-center rounded-[var(--ui-radius-md)]">
                    <CircleCheckIcon className="w-4.5 h-4.5 mt-px stroke-[1.5] text-text-muted/40" />
                  </div>
                </Tooltip>
              )}
              {showPinControl && currentNote && pinNote && unpinNote && (
                <Tooltip content={isPinned ? "Unpin note" : "Pin note"}>
                  <IconButton
                    onClick={async () => {
                      if (!currentNote) return;
                      try {
                        if (isPinned) {
                          await unpinNote(currentNote.id);
                          toast.success("Note unpinned");
                        } else {
                          await pinNote(currentNote.id);
                          toast.success("Note pinned");
                        }
                        const updatedSettings = await notesService.getSettings();
                        setSettings(updatedSettings);
                      } catch (error) {
                        console.error("Failed to pin/unpin note:", error);
                        toast.error(
                          `Failed to ${isPinned ? "unpin" : "pin"} note: ${error instanceof Error ? error.message : "Unknown error"}`,
                        );
                      }
                    }}
                  >
                    <PinIcon className={cn("w-5 h-5 stroke-[1.3]", isPinned && "fill-current")} />
                  </IconButton>
                </Tooltip>
              )}
              {currentNote && (
                <Tooltip content={`Find in note (${mod}${isMac ? "" : "+"}F)`}>
                  <IconButton onClick={openEditorSearch}>
                    <TextSearch className="w-4.25 h-4.25 stroke-[1.6]" />
                  </IconButton>
                </Tooltip>
              )}
              {currentNote && (
                <Tooltip
                  content={
                    effectiveSourceMode
                      ? `View formatted (${mod}${isMac ? "" : "+"}${shift}${isMac ? "" : "+"}M)`
                      : `View markdown source (${mod}${isMac ? "" : "+"}${shift}${isMac ? "" : "+"}M)`
                  }
                >
                  <IconButton onClick={toggleSourceMode}>
                    {effectiveSourceMode ? (
                      <MarkdownOffIcon className="w-4.75 h-4.75 stroke-[1.4]" />
                    ) : (
                      <MarkdownIcon className="w-4.75 h-4.75 stroke-[1.4]" />
                    )}
                  </IconButton>
                </Tooltip>
              )}
              <DropdownMenu.Root open={copyMenuOpen} onOpenChange={setCopyMenuOpen}>
                <Tooltip content={`Export (${mod}${isMac ? "" : "+"}${shift}${isMac ? "" : "+"}C)`}>
                  <DropdownMenu.Trigger asChild>
                    <IconButton>
                      <ShareIcon className="w-4.25 h-4.25 stroke-[1.6]" />
                    </IconButton>
                  </DropdownMenu.Trigger>
                </Tooltip>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    className={`${menuSurfaceClassName} min-w-35 z-50`}
                    sideOffset={5}
                    align="end"
                    onCloseAutoFocus={(e) => e.preventDefault()}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                        e.stopPropagation();
                      }
                    }}
                  >
                    <DropdownMenu.Item className={menuItemClassName} onSelect={handleCopyMarkdown}>
                      <CopyIcon className="w-4 h-4 stroke-[1.6]" />
                      Copy Markdown
                    </DropdownMenu.Item>
                    <DropdownMenu.Item className={menuItemClassName} onSelect={handleCopyPlainText}>
                      <CopyIcon className="w-4 h-4 stroke-[1.6]" />
                      Copy Plain Text
                    </DropdownMenu.Item>
                    <DropdownMenu.Item className={menuItemClassName} onSelect={handleCopyHtml}>
                      <CopyIcon className="w-4 h-4 stroke-[1.6]" />
                      Copy HTML
                    </DropdownMenu.Item>
                    <DropdownMenu.Separator className={menuSeparatorClassName} />
                    <DropdownMenu.Item className={menuItemClassName} onSelect={handleDownloadPdf}>
                      <DownloadIcon className="w-4 h-4 stroke-[1.6]" />
                      Print as PDF
                    </DropdownMenu.Item>
                    <DropdownMenu.Item className={menuItemClassName} onSelect={handleDownloadMarkdown}>
                      <DownloadIcon className="w-4 h-4 stroke-[1.6]" />
                      Export Markdown
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
              {onSaveToFolder && (
                <Tooltip content="Save in folder">
                  <IconButton
                    onClick={onSaveToFolder}
                    aria-label="Save in folder"
                    disabled={saveToFolderDisabled}
                  >
                    {saveToFolderDisabled ? (
                      <LoadingSpinner size="md" tone="inherit" />
                    ) : (
                      <FolderPlusIcon className="w-4.25 h-4.25 stroke-[1.6]" />
                    )}
                  </IconButton>
                </Tooltip>
              )}
              <div className="w-2 shrink-0" />
            </div>
          </div>
        </>
      )}

      {/* Editor content area with resize handles overlay */}
      <div className={cn("flex-1 relative overflow-hidden", printMode && "overflow-visible")}>
        {!focusMode && !effectiveSourceMode && !printMode && (
          <EditorWidthHandles containerRef={scrollContainerRef} />
        )}
        <div
          ref={scrollContainerRef}
          className={cn(
            "ui-scrollbar-overlay",
            printMode
              ? "print-note-scroll overflow-visible"
              : effectiveSourceMode && !sourceModeWordWrap
                ? "absolute inset-0 overflow-auto"
                : "absolute inset-0 overflow-y-auto overflow-x-hidden",
          )}
          dir={textDirection}
        >
          {effectiveSourceMode ? (
            /* Markdown source editor */
            <div className="h-full">
              <div
                className={cn(
                  "min-h-full px-6 pt-6 pb-24",
                  !sourceModeWordWrap && "w-max min-w-full",
                )}
                style={{
                  maxWidth: sourceModeWordWrap
                    ? "var(--editor-max-width, 48rem)"
                    : "none",
                  minHeight: "100%",
                  marginLeft: "auto",
                  marginRight: "auto",
                }}
              >
                {currentNote && renameNote && !printMode && !focusMode ? (
                  <EditorFilenameField
                    noteId={currentNote.id}
                    documentTitle={documentTitle}
                    onRename={handleRenameFromEditor}
                    focusRequestToken={filenameFocusRequestToken}
                  />
                ) : null}
                <MarkdownSourceEditor
                  ref={sourceEditorRef}
                  value={sourceContent}
                  onChange={handleSourceChange}
                  textDirection={textDirection}
                  wordWrap={sourceModeWordWrap}
                  syntaxHighlightingEnabled={sourceModeSyntaxHighlight}
                />
              </div>
            </div>
          ) : (
            <>
              {!printMode && searchOpen && (
                <div className="sticky top-2 z-10 animate-in fade-in slide-in-from-top-4 duration-[180ms] pointer-events-none pr-2 flex justify-end">
                  <div className="pointer-events-auto">
                    <SearchToolbar
                      inputRef={searchInputRef}
                      query={searchQuery}
                      onChange={handleSearchChange}
                      onNext={goToNextMatch}
                      onPrevious={goToPreviousMatch}
                      onClose={clearSearch}
                      currentMatch={
                        searchMatches.length === 0 ? 0 : currentMatchIndex + 1
                      }
                      totalMatches={searchMatches.length}
                    />
                  </div>
                </div>
              )}
              <div
                className="h-full"
                onContextMenu={handleContextMenu}
              >
                <div
                  className="min-h-full px-6 pt-6 pb-24"
                  style={{
                    maxWidth: "var(--editor-max-width, 48rem)",
                    minHeight: "100%",
                    marginLeft: "auto",
                    marginRight: "auto",
                  }}
                >
                  {currentNote && renameNote && !printMode && !focusMode ? (
                    <EditorFilenameField
                      noteId={currentNote.id}
                      documentTitle={documentTitle}
                      onRename={handleRenameFromEditor}
                      focusRequestToken={filenameFocusRequestToken}
                    />
                  ) : null}
                  <EditorContent editor={editor} className="h-full text-text" />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

import { CheckSquare, FileText } from "lucide-react";
import { Footer } from "../layout/Footer";
import { TaskModeNavigationSection } from "./TasksSection";
import { useNotes } from "../../context/NotesContext";
import { useTasks } from "../../context/TasksContext";
import { FolderGlyph } from "../folders/FolderGlyph";
import {
  getFolderAppearance,
  resolveFolderAppearanceIconColor,
  resolveFolderAppearanceTextColor,
} from "../../lib/folderIcons";
import { useTheme } from "../../context/ThemeContext";
import { useCallback, useEffect, useRef, useState, lazy, Suspense } from "react";
import type { CSSProperties } from "react";
import type { FolderAppearance } from "../../types/note";
import {
  CountBadge,
  Tooltip,
  menuItemClassName,
  menuSurfaceClassName,
} from "../ui";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { PencilIcon, SwatchIcon } from "../icons";
import { mod, shortcut } from "../../lib/platform";

const FolderIconPickerModal = lazy(() =>
  import("../folders/FolderIconPickerModal").then((module) => ({
    default: module.FolderIconPickerModal,
  })),
);

function InlineTagRenameEditor({
  initialValue,
  style,
  onSubmit,
  onCancel,
}: {
  initialValue: string;
  style?: CSSProperties;
  onSubmit: (name: string) => Promise<void> | void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const commitRename = useCallback(async () => {
    if (isSubmitting) return;

    const trimmed = value.trim();
    if (!trimmed || trimmed === initialValue.trim()) {
      onCancel();
      return;
    }

    try {
      setIsSubmitting(true);
      await onSubmit(trimmed);
    } catch {
      setIsSubmitting(false);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [initialValue, isSubmitting, onCancel, onSubmit, value]);

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      disabled={isSubmitting}
      placeholder="Tag name"
      onChange={(event) => setValue(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onBlur={() => {
        void commitRename();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          void commitRename();
          return;
        }

        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onCancel();
        }
      }}
      className="block h-5 min-w-0 flex-1 appearance-none border-0 bg-transparent p-0 text-sm font-medium leading-5 text-text outline-none shadow-none placeholder:text-text-muted disabled:opacity-50"
      style={style}
    />
  );
}

interface TaskNavigationPaneProps {
  onOpenSettings?: () => void;
  onShowNotes?: () => void;
  onShowTasks?: () => void;
}

export function TaskNavigationPane({
  onOpenSettings,
  onShowNotes,
  onShowTasks,
}: TaskNavigationPaneProps) {
  return (
    <div className="ui-pane-shell flex h-full flex-col select-none bg-bg-secondary">
      <div className="ui-pane-drag-region" data-tauri-drag-region></div>
      <div className="ui-pane-header border-border/80">
        {onShowNotes && onShowTasks ? (
          <div className="flex min-w-0 items-center gap-1 -ml-2">
            <Tooltip content={`Notes (${shortcut(mod, "1")})`}>
              <button
                type="button"
                aria-pressed={false}
                onClick={onShowNotes}
                className="ui-focus-ring flex items-center h-[var(--ui-control-height-compact)] px-2 rounded-[var(--ui-radius-md)] text-text-muted transition-colors hover:bg-bg-muted hover:text-text outline-none"
              >
                <FileText className="h-4 w-4 shrink-0 stroke-[1.7]" />
              </button>
            </Tooltip>
            <Tooltip content={`Tasks (${shortcut(mod, "2")})`}>
              <button
                type="button"
                aria-pressed={true}
                onClick={onShowTasks}
                className="ui-focus-ring ui-pane-mode-active flex shrink-0 items-center gap-1.5 rounded-[var(--ui-radius-md)] font-medium text-base text-text bg-bg-muted px-2 h-[var(--ui-control-height-compact)] outline-none"
              >
                <CheckSquare className="h-4 w-4 shrink-0 stroke-[1.7]" />
                <span className="ui-pane-mode-label">Tasks</span>
              </button>
            </Tooltip>
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <CheckSquare className="h-4.5 w-4.5 shrink-0 text-text-muted/80 stroke-[1.7]" />
            <div className="min-w-0 truncate font-medium text-base text-text">Tasks</div>
          </div>
        )}
      </div>

      <div className="ui-scrollbar-overlay flex-1 overflow-y-auto py-2.5">
        <TaskModeNavigationSection />
        <TaskTagsSection />
      </div>

      <Footer onOpenSettings={onOpenSettings} />
    </div>
  );
}

function TaskTagsSection() {
  const { tagNames, tagBuckets, selectedTag, selectTag, renameTag } = useTasks();
  const { taskTagAppearances, setTaskTagAppearance } = useNotes();
  const { resolvedTheme } = useTheme();
  const [editingTagStyle, setEditingTagStyle] = useState<string | null>(null);
  const [renamingTag, setRenamingTag] = useState<string | null>(null);

  if (tagNames.length === 0) return null;

  return (
    <section className="mt-2 px-1.5 pt-2" aria-label="Tags">
      <div className="mx-3 mb-2 border-t border-border/50" />
      <nav className="space-y-1" aria-label="Task tags">
        {tagNames.map((tag) => {
          const appearance = getFolderAppearance(taskTagAppearances, tag);
          const textColor = resolveFolderAppearanceTextColor(appearance, resolvedTheme);
          const iconColor = resolveFolderAppearanceIconColor(appearance, resolvedTheme);
          const style = textColor ? { color: textColor } : undefined;
          const iconStyle = iconColor ? { color: iconColor } : undefined;
          const isSelected = selectedTag === tag;
          return (
            <ContextMenu.Root key={tag}>
              <ContextMenu.Trigger asChild>
                {renamingTag === tag ? (
                  <div className="flex w-full items-center gap-3 rounded-[var(--ui-radius-md)] bg-bg-muted pl-3 pr-2 py-2">
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <FolderGlyph
                        icon={appearance?.icon ?? { kind: "lucide", name: "hash" }}
                        className="h-4.25 w-4.25 shrink-0 stroke-[1.7] text-text-muted/80"
                        style={iconStyle}
                      />
                      <InlineTagRenameEditor
                        initialValue={tag}
                        style={style}
                        onCancel={() => setRenamingTag(null)}
                        onSubmit={async (nextTag) => {
                          await renameTag(tag, nextTag);
                          const currentAppearance = getFolderAppearance(taskTagAppearances, tag);
                          if (currentAppearance) {
                            await setTaskTagAppearance(nextTag, currentAppearance);
                            await setTaskTagAppearance(tag, null);
                          }
                          setRenamingTag(null);
                        }}
                      />
                    </span>
                  </div>
                ) : (
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => selectTag(tag)}
                    className={`ui-focus-ring flex w-full items-center gap-3 rounded-[var(--ui-radius-md)] pl-3 pr-2 py-2 text-left transition-colors ${
                      isSelected ? "bg-bg-muted text-text" : "text-text hover:bg-bg-muted/80"
                    }`}
                    style={style}
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <FolderGlyph
                        icon={appearance?.icon ?? { kind: "lucide", name: "hash" }}
                        className="h-4.25 w-4.25 shrink-0 stroke-[1.7] text-text-muted/80"
                        style={iconStyle}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{tag}</span>
                    </span>
                    <span className="ui-count-badge-column">
                      <CountBadge
                        count={tagBuckets[tag]?.length ?? 0}
                        layout="column"
                        emphasis={isSelected ? "active" : "inactive"}
                      />
                    </span>
                  </button>
                )}
              </ContextMenu.Trigger>
              <ContextMenu.Portal>
                <ContextMenu.Content className={`${menuSurfaceClassName} min-w-44 z-50`}>
                  <ContextMenu.Item
                    className={menuItemClassName}
                    onSelect={() => setRenamingTag(tag)}
                  >
                    <PencilIcon className="w-4 h-4 stroke-[1.6]" />
                    Rename
                  </ContextMenu.Item>
                  <ContextMenu.Item
                    className={menuItemClassName}
                    onSelect={() => setEditingTagStyle(tag)}
                  >
                    <SwatchIcon className="w-4 h-4 stroke-[1.6]" />
                    Change Icon and Color
                  </ContextMenu.Item>
                </ContextMenu.Content>
              </ContextMenu.Portal>
            </ContextMenu.Root>
          );
        })}
      </nav>
      <Suspense fallback={null}>
        <FolderIconPickerModal
          open={Boolean(editingTagStyle)}
          value={
            editingTagStyle
              ? getFolderAppearance(taskTagAppearances, editingTagStyle) ?? {
                  icon: { kind: "lucide", name: "hash" },
                }
              : null
          }
          title={editingTagStyle ? `Customize ${editingTagStyle}` : "Customize Tag"}
          description="Pick an icon or emoji and apply a tag color."
          onOpenChange={(open) => {
            if (!open) setEditingTagStyle(null);
          }}
          onApply={async (appearance: FolderAppearance | null) => {
            if (editingTagStyle) {
              await setTaskTagAppearance(editingTagStyle, appearance);
            }
            setEditingTagStyle(null);
          }}
        />
      </Suspense>
    </section>
  );
}

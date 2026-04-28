import {
  useState,
  useEffect,
  useCallback,
  useId,
  useRef,
  useMemo,
  type KeyboardEvent,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ArrowLeft,
  Archive,
  CalendarClock,
  CheckSquare,
  CheckCheck,
  Clock3,
  FilePlusCorner,
  FileText,
  Inbox,
  Layers,
  PanelLeft,
  PanelRight,
  Plus,
  SquareArrowOutUpRight,
  Star,
  Sun,
} from "lucide-react";
import { toast } from "sonner";
import { useNotes } from "../../context/NotesContext";
import { useTheme } from "../../context/ThemeContext";
import { useGit } from "../../context/GitContext";
import { useTasks } from "../../context/TasksContext";
import * as notesService from "../../services/notes";
import { downloadPdf, downloadMarkdown } from "../../services/pdf";
import type { Settings } from "../../types/note";
import type { ThemePresetId } from "../../types/note";
import type { TaskView } from "../../types/tasks";
import type { Editor } from "@tiptap/react";
import {
  DARK_THEME_PRESETS,
  LIGHT_THEME_PRESETS,
  resolveThemeTokens,
  themeColorsToCSSVariables,
} from "../../lib/appearance";
import {
  commandMatchesQuery,
  type AppCommand,
} from "../../lib/commandRegistry";
import {
  CommandItem,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Checkbox,
  DialogShell,
} from "../ui";
import {
  cleanPreviewText,
  cleanTitle,
  getDisplayInitial,
} from "../../lib/utils";
import { plainTextFromMarkdown } from "../../lib/plainText";
import { duplicateNote } from "../../services/notes";
import {
  deriveView,
  taskMatchesQuery,
  TASK_VIEW_LABELS,
  TASK_VIEW_ORDER,
} from "../../lib/tasks";
import {
  CopyIcon,
  DownloadIcon,
  SettingsIcon,
  SwatchIcon,
  GitCommitIcon,
  RefreshCwIcon,
  TrashIcon,
  PinIcon,
  ZenIcon,
  MarkdownIcon,
  FolderIcon,
  FolderPlusIcon,
  InfoIcon,
  KeyboardIcon,
  SearchIcon,
} from "../icons";
import { mod, shift } from "../../lib/platform";

const RECENT_COMMANDS_STORAGE_KEY = "sly.recentCommandIds";
const MAX_RECENT_COMMANDS = 5;

const TASK_VIEW_ICONS: Record<TaskView, React.ComponentType<{ className?: string }>> = {
  inbox: Inbox,
  today: Sun,
  upcoming: CalendarClock,
  waiting: Clock3,
  anytime: Layers,
  someday: Archive,
  completed: CheckCheck,
  starred: Star,
};

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onOpenSettings?: () => void;
  onOpenSettingsTab?: (tab: "notes" | "tasks" | "editor" | "extensions" | "shortcuts" | "about") => void;
  focusMode?: boolean;
  onToggleFocusMode?: () => void;
  rightPanelVisible?: boolean;
  onToggleRightPanel?: () => void;
  onShowNotes?: () => void;
  onShowTasks?: () => void;
  onOpenTaskCapture?: () => void;
  onReloadCurrentNote?: () => void;
  editorRef?: React.RefObject<Editor | null>;
  flushPendingSave?: (() => Promise<void>) | null;
}

export function CommandPalette({
  open,
  onClose,
  onOpenSettings,
  onOpenSettingsTab,
  focusMode,
  onToggleFocusMode,
  rightPanelVisible = true,
  onToggleRightPanel,
  onShowNotes,
  onShowTasks,
  onOpenTaskCapture,
  onReloadCurrentNote,
  editorRef,
  flushPendingSave,
}: CommandPaletteProps) {
  const {
    notes,
    selectNote,
    createNote,
    deleteNote,
    currentNote,
    refreshNotes,
    pinNote,
    unpinNote,
    notesFolder,
  } = useNotes();
  const {
    theme,
    appearanceSettings,
    resolvedTheme,
    setTheme,
    lightPresetId,
    darkPresetId,
    setLightPresetId,
    setDarkPresetId,
    setInterfaceZoom,
    setPaneMode,
    textDirection,
    setTextDirection,
    confirmDeletions,
    setConfirmDeletions,
  } = useTheme();
  const { status, gitAvailable, gitEnabled, commit, sync, isSyncing } = useGit();
  const {
    tasks,
    today,
    selectedView,
    selectedTask,
    selectedTaskId,
    selectedTaskIds,
    tagNames,
    selectView,
    selectTag,
    selectTask,
    setCompleted,
    deleteTask: deleteTaskAction,
    refreshTasks,
  } = useTasks();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null);
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const [activeSubmenu, setActiveSubmenu] = useState<"root" | "theme">("root");
  const [recentCommandIds, setRecentCommandIds] = useState<string[]>([]);
  const [themePreview, setThemePreview] = useState<{
    kind: "light" | "dark";
    originalPresetId: ThemePresetId;
    committed: boolean;
  } | null>(null);
  const dontAskAgainId = useId();
  const [localSearchResults, setLocalSearchResults] = useState<
    { id: string; title: string; preview: string; modified: number }[]
  >([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    try {
      const raw = window.localStorage.getItem(RECENT_COMMANDS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        setRecentCommandIds(parsed.filter((id): id is string => typeof id === "string"));
      }
    } catch (error) {
      console.error("Failed to load recent commands:", error);
    }
  }, [open]);

  const rememberCommand = useCallback((id: string) => {
    setRecentCommandIds((prev) => {
      const next = [id, ...prev.filter((recentId) => recentId !== id)].slice(
        0,
        MAX_RECENT_COMMANDS,
      );
      try {
        window.localStorage.setItem(
          RECENT_COMMANDS_STORAGE_KEY,
          JSON.stringify(next),
        );
      } catch (error) {
        console.error("Failed to save recent commands:", error);
      }
      return next;
    });
  }, []);

  const applyThemePreviewVariables = useCallback(
    (presetId?: ThemePresetId) => {
      const nextAppearance = presetId
        ? {
            ...appearanceSettings,
            [themePreview?.kind === "dark" ? "darkPresetId" : "lightPresetId"]:
              presetId,
          }
        : appearanceSettings;
      const previewTheme = themePreview?.kind ?? resolvedTheme;
      const tokens = resolveThemeTokens(nextAppearance, previewTheme);

      for (const [key, value] of Object.entries(themeColorsToCSSVariables(tokens))) {
        document.documentElement.style.setProperty(key, value);
      }
    },
    [appearanceSettings, resolvedTheme, themePreview?.kind],
  );

  const restoreThemePreview = useCallback(() => {
    if (!themePreview) return;

    if (!themePreview.committed) {
      applyThemePreviewVariables(themePreview.originalPresetId);
    }
    setThemePreview(null);
  }, [applyThemePreviewVariables, themePreview]);

  const leaveThemeSubmenu = useCallback(() => {
    restoreThemePreview();
    setActiveSubmenu("root");
    setQuery("");
    setSelectedIndex(0);
  }, [restoreThemePreview]);

  const handlePaletteClose = useCallback(() => {
    restoreThemePreview();
    onClose();
  }, [onClose, restoreThemePreview]);

  // Load settings when palette opens or current note changes
  useEffect(() => {
    if (open) {
      notesService.getSettings().then(setSettings);
    }
  }, [open, currentNote?.id]);

  // Memoize commands array
  const commands = useMemo<AppCommand[]>(() => {
    const baseCommands: AppCommand[] = [
      {
        id: "new-note",
        label: "New Note",
        section: "Notes",
        shortcut: `${mod} ${shift} N`,
        keywords: ["create", "document", "markdown"],
        icon: <FilePlusCorner className="w-4.5 h-4.5 stroke-[1.5]" />,
        action: () => {
          createNote();
          onClose();
        },
      },
      {
        id: "new-folder",
        label: "New Folder",
        section: "Notes",
        keywords: ["create", "directory"],
        shortcut: undefined,
        icon: <FolderPlusIcon className="w-4.5 h-4.5 stroke-[1.5]" />,
        action: () => {
          onClose();
          window.dispatchEvent(new CustomEvent("create-new-folder"));
        },
      },
    ];

    // Add note-specific commands if a note is selected
    if (currentNote) {
      const isPinned =
        settings?.pinnedNoteIds?.includes(currentNote.id) || false;

      baseCommands.push(
        {
          id: isPinned ? "unpin-note" : "pin-note",
          label: isPinned ? "Unpin Current Note" : "Pin Current Note",
          section: "Notes",
          keywords: ["favorite", "pinned"],
          icon: <PinIcon className="w-5 h-5 stroke-[1.3]" />,
          action: async () => {
            try {
              if (isPinned) {
                await unpinNote(currentNote.id);
              } else {
                await pinNote(currentNote.id);
              }
              onClose();
            } catch (error) {
              console.error("Failed to pin/unpin note:", error);
              toast.error(`Failed to ${isPinned ? "unpin" : "pin"} note`);
            }
          },
        },
        {
          id: "duplicate-note",
          label: "Duplicate Current Note",
          section: "Notes",
          shortcut: `${mod} D`,
          keywords: ["copy", "clone"],
          icon: <CopyIcon className="w-4.5 h-4.5 stroke-[1.5]" />,
          action: async () => {
            try {
              const newNote = await duplicateNote(currentNote.id);
              await refreshNotes();
              selectNote(newNote.id);
              onClose();
            } catch (error) {
              console.error("Failed to duplicate note:", error);
            }
          },
        },
        {
          id: "open-note-window",
          label: "Open Current Note in New Window",
          section: "Notes",
          keywords: ["preview", "detached", "separate"],
          icon: <SquareArrowOutUpRight className="w-4.5 h-4.5 stroke-[1.5]" />,
          action: async () => {
            try {
              await flushPendingSave?.();
              await notesService.openNoteWindow(currentNote.id);
              onClose();
            } catch (error) {
              console.error("Failed to open note window:", error);
              toast.error("Failed to open note in new window");
            }
          },
        },
        {
          id: "delete-note",
          label: "Delete Current Note",
          section: "Notes",
          keywords: ["remove", "trash"],
          icon: <TrashIcon className="w-4.5 h-4.5 stroke-[1.5]" />,
          action: async () => {
            if (!confirmDeletions) {
              try {
                await deleteNote(currentNote.id);
                onClose();
              } catch (error) {
                console.error("Failed to delete note:", error);
                toast.error("Failed to delete note");
              }
              return;
            }
            setDontAskAgain(false);
            setNoteToDelete(currentNote.id);
            setDeleteDialogOpen(true);
          },
        },
        {
          id: "reload-note",
          label: "Reload Current Note",
          section: "Notes",
          shortcut: `${mod} R`,
          keywords: ["refresh", "external changes"],
          icon: <RefreshCwIcon className="w-4.5 h-4.5 stroke-[1.5]" />,
          action: () => {
            onReloadCurrentNote?.();
            onClose();
          },
        },
        {
          id: "copy-markdown",
          label: "Copy Markdown",
          section: "Editor",
          keywords: ["clipboard", "export"],
          icon: <CopyIcon className="w-4.5 h-4.5 stroke-[1.5]" />,
          action: async () => {
            try {
              let markdown = currentNote.content;
              const editorInstance = editorRef?.current;
              if (editorInstance) {
                const manager = editorInstance.storage.markdown?.manager;
                if (manager) {
                  markdown = manager.serialize(editorInstance.getJSON());
                  markdown = markdown.replace(/&nbsp;|&#160;/g, " ");
                } else {
                  markdown = editorInstance.getText();
                }
              }

              await invoke("copy_to_clipboard", { text: markdown });
              toast.success("Copied as Markdown");
              onClose();
            } catch (error) {
              console.error("Failed to copy markdown:", error);
              toast.error("Failed to copy");
            }
          },
        },
        {
          id: "copy-plain",
          label: "Copy Plain Text",
          section: "Editor",
          keywords: ["clipboard", "text"],
          icon: <CopyIcon className="w-4.5 h-4.5 stroke-[1.5]" />,
          action: async () => {
            try {
              let markdown = currentNote.content;
              const editorInstance = editorRef?.current;
              if (editorInstance) {
                const manager = editorInstance.storage.markdown?.manager;
                if (manager) {
                  markdown = manager.serialize(editorInstance.getJSON());
                  markdown = markdown.replace(/&nbsp;|&#160;/g, " ");
                } else {
                  markdown = editorInstance.getText();
                }
              }

              const plainText = plainTextFromMarkdown(markdown);
              await invoke("copy_to_clipboard", { text: plainText });
              toast.success("Copied as plain text");
              onClose();
            } catch (error) {
              console.error("Failed to copy plain text:", error);
              toast.error("Failed to copy");
            }
          },
        },
        {
          id: "copy-html",
          label: "Copy HTML",
          section: "Editor",
          keywords: ["clipboard", "markup"],
          icon: <CopyIcon className="w-4.5 h-4.5 stroke-[1.5]" />,
          action: async () => {
            try {
              if (!editorRef?.current) {
                toast.error("Editor not available");
                return;
              }
              const html = editorRef.current.getHTML();
              await invoke("copy_to_clipboard", { text: html });
              toast.success("Copied as HTML");
              onClose();
            } catch (error) {
              console.error("Failed to copy HTML:", error);
              toast.error("Failed to copy");
            }
          },
        },
        {
          id: "download-pdf",
          label: "Print as PDF",
          section: "Editor",
          keywords: ["export", "download"],
          icon: <DownloadIcon className="w-4.5 h-4.5 stroke-[1.5]" />,
          action: async () => {
            try {
              if (!currentNote) {
                toast.error("No note selected");
                return;
              }
              await flushPendingSave?.();
              await downloadPdf(currentNote.path);
              onClose();
            } catch (error) {
              console.error("Failed to open print dialog:", error);
              toast.error("Failed to open print dialog");
            }
          },
        },
        {
          id: "download-markdown",
          label: "Export Markdown",
          section: "Editor",
          keywords: ["download", "save"],
          icon: <DownloadIcon className="w-4.5 h-4.5 stroke-[1.5]" />,
          action: async () => {
            try {
              if (!currentNote) {
                toast.error("No note selected");
                return;
              }
              // Use live editor content with nbsp cleanup, fall back to saved content
              let markdown = currentNote.content;
              const editorInstance = editorRef?.current;
              if (editorInstance) {
                const manager = editorInstance.storage.markdown?.manager;
                if (manager) {
                  markdown = manager.serialize(editorInstance.getJSON());
                  markdown = markdown.replace(/&nbsp;|&#160;/g, " ");
                } else {
                  markdown = editorInstance.getText();
                }
              }
              const saved = await downloadMarkdown(markdown, currentNote.title);
              if (saved) {
                toast.success("Markdown saved successfully");
                onClose();
              }
            } catch (error) {
              console.error("Failed to download markdown:", error);
              toast.error("Failed to save markdown");
            }
          },
        },
      );
    }

    // Add git commands when git integration is visible and initialized
    if (gitEnabled && gitAvailable && status?.isRepo) {
      const hasChanges = (status?.changedCount ?? 0) > 0;
      const canSync = status?.hasRemote && status?.hasUpstream && !isSyncing;

      if (hasChanges) {
        baseCommands.push({
          id: "git-commit",
          label: "Git: Quick Commit",
          section: "Git",
          keywords: ["version control", "snapshot"],
          icon: <GitCommitIcon className="w-4.5 h-4.5 stroke-[1.5]" />,
          action: async () => {
            const success = await commit("Quick commit from Sly");
            if (success) {
              toast.success("Changes committed");
            } else {
              toast.error("Failed to commit");
            }
            onClose();
          },
        });
      }

      if (canSync) {
        baseCommands.push({
          id: "git-sync",
          label: "Git: Sync (Pull and Push)",
          section: "Git",
          keywords: ["version control", "push", "pull"],
          icon: <RefreshCwIcon className="w-4.5 h-4.5 stroke-[1.5]" />,
          action: async () => {
            const result = await sync();
            if (result.ok) {
              toast.success(result.message);
            } else {
              toast.error(result.error);
            }
            onClose();
          },
        });
      }
    }

    const selectedTaskActionIds =
      selectedTaskIds.length > 0
        ? selectedTaskIds
        : selectedTaskId
          ? [selectedTaskId]
          : [];

    baseCommands.push(
      {
        id: "new-task",
        label: "New Task",
        section: "Tasks",
        shortcut: `${mod} ${shift} T`,
        keywords: ["create", "capture", "quick add", "todo"],
        icon: <Plus className="w-4.5 h-4.5 stroke-[1.8]" />,
        action: () => {
          onOpenTaskCapture?.();
          onClose();
        },
      },
      {
        id: "new-task-current-view",
        label: `New Task in ${TASK_VIEW_LABELS[selectedView]}`,
        section: "Tasks",
        shortcut: `${mod} N`,
        keywords: ["create", "inline", "todo"],
        icon: <Plus className="w-4.5 h-4.5 stroke-[1.8]" />,
        action: () => {
          onShowTasks?.();
          requestAnimationFrame(() => {
            window.dispatchEvent(new CustomEvent("start-inline-task-create"));
          });
          onClose();
        },
      },
      {
        id: "search-tasks",
        label: "Search Tasks",
        section: "Tasks",
        shortcut: `${mod} ${shift} F`,
        keywords: ["find", "all tasks", "todo"],
        icon: <SearchIcon className="w-4.5 h-4.5 stroke-[1.5]" />,
        action: () => {
          onShowTasks?.();
          requestAnimationFrame(() => {
            window.dispatchEvent(new CustomEvent("open-tasks-search"));
          });
          onClose();
        },
      },
      {
        id: "refresh-tasks",
        label: "Refresh Tasks",
        section: "Tasks",
        keywords: ["reload", "sync"],
        icon: <RefreshCwIcon className="w-4.5 h-4.5 stroke-[1.5]" />,
        action: async () => {
          await refreshTasks();
          onClose();
        },
      },
    );

    for (const view of TASK_VIEW_ORDER) {
      const Icon = TASK_VIEW_ICONS[view];
      baseCommands.push({
        id: `task-view-${view}`,
        label: `Show ${TASK_VIEW_LABELS[view]} Tasks`,
        section: "Tasks",
        keywords: ["tasks", "view", "list", TASK_VIEW_LABELS[view]],
        icon: <Icon className="w-4.5 h-4.5 stroke-[1.7]" />,
        action: () => {
          selectView(view);
          onShowTasks?.();
          onClose();
        },
      });
    }

    for (const tagName of tagNames) {
      baseCommands.push({
        id: `task-tag-${tagName}`,
        label: `Show Task Tag: ${tagName}`,
        section: "Tasks",
        keywords: ["tasks", "tag", tagName],
        icon: <FolderIcon className="w-4.5 h-4.5 stroke-[1.5]" />,
        action: () => {
          selectTag(tagName);
          onShowTasks?.();
          onClose();
        },
      });
    }

    if (selectedTaskActionIds.length > 0) {
      const taskCountLabel =
        selectedTaskActionIds.length > 1
          ? `${selectedTaskActionIds.length} Selected Tasks`
          : "Current Task";
      const isCurrentTaskCompleted = Boolean(selectedTask?.completedAt);
      baseCommands.push(
        {
          id: "toggle-current-task-complete",
          label: `${isCurrentTaskCompleted ? "Reopen" : "Complete"} ${taskCountLabel}`,
          section: "Tasks",
          keywords: ["done", "finish", "checkbox"],
          icon: <CheckCheck className="w-4.5 h-4.5 stroke-[1.7]" />,
          action: async () => {
            await Promise.all(
              selectedTaskActionIds.map((id) =>
                setCompleted(id, !isCurrentTaskCompleted),
              ),
            );
            onClose();
          },
        },
        {
          id: "delete-current-task",
          label: `Delete ${taskCountLabel}`,
          section: "Tasks",
          keywords: ["remove", "trash"],
          icon: <TrashIcon className="w-4.5 h-4.5 stroke-[1.5]" />,
          action: async () => {
            await Promise.all(selectedTaskActionIds.map((id) => deleteTaskAction(id)));
            onClose();
          },
        },
      );
    }

    // Focus mode and source toggle
    baseCommands.push(
      {
        id: "show-notes",
        label: "Switch to Notes",
        section: "Navigation",
        shortcut: `${mod} 1`,
        keywords: ["workspace", "mode"],
        icon: <FileText className="w-4.5 h-4.5 stroke-[1.7]" />,
        action: () => {
          onShowNotes?.();
          onClose();
        },
      },
      {
        id: "show-tasks",
        label: "Switch to Tasks",
        section: "Tasks",
        shortcut: `${mod} 2`,
        keywords: ["workspace", "mode"],
        icon: <CheckSquare className="w-4.5 h-4.5 stroke-[1.7]" />,
        action: () => {
          onShowTasks?.();
          onClose();
        },
      },
      {
        id: "search-notes",
        label: "Search Notes",
        section: "Navigation",
        shortcut: `${mod} ${shift} F`,
        keywords: ["find", "all notes", "sidebar"],
        icon: <SearchIcon className="w-4.5 h-4.5 stroke-[1.5]" />,
        action: () => {
          window.dispatchEvent(new CustomEvent("open-notes-search"));
          onClose();
        },
      },
      {
        id: "toggle-outline-panel",
        label: `${rightPanelVisible ? "Hide" : "Show"} Right Pane`,
        section: "Navigation",
        shortcut: `${mod} ${shift} ]`,
        keywords: ["outline", "assistant", "panel"],
        icon: <PanelRight className="w-4.5 h-4.5 stroke-[1.5]" />,
        action: () => {
          onToggleRightPanel?.();
          onClose();
        },
      },
      {
        id: "focus-mode",
        label: focusMode ? "Exit Focus Mode" : "Enter Focus Mode",
        section: "Editor",
        shortcut: `${mod} ${shift} Enter`,
        keywords: ["zen", "writing"],
        icon: <ZenIcon className="w-4.5 h-4.5 stroke-[1.5]" />,
        action: () => {
          onToggleFocusMode?.();
          onClose();
        },
      },
      {
        id: "toggle-source",
        label: "Toggle Markdown Source",
        section: "Editor",
        shortcut: `${mod} ${shift} M`,
        keywords: ["source mode", "markdown"],
        icon: <MarkdownIcon className="w-4.5 h-4.5 stroke-[1.5]" />,
        action: () => {
          window.dispatchEvent(new CustomEvent("toggle-source-mode"));
          onClose();
        },
      },
      {
        id: "pane-one",
        label: "Switch to 1-Pane View",
        section: "Navigation",
        shortcut: `${mod} ${shift} J`,
        keywords: ["layout", "workspace"],
        icon: <PanelLeft className="w-4.5 h-4.5 stroke-[1.5]" />,
        action: () => {
          setPaneMode(1);
          onClose();
        },
      },
      {
        id: "pane-two",
        label: "Switch to 2-Pane View",
        section: "Navigation",
        shortcut: `${mod} ${shift} K`,
        keywords: ["layout", "workspace"],
        icon: <PanelLeft className="w-4.5 h-4.5 stroke-[1.5]" />,
        action: () => {
          setPaneMode(2);
          onClose();
        },
      },
      {
        id: "pane-three",
        label: "Switch to 3-Pane View",
        section: "Navigation",
        shortcut: `${mod} ${shift} L`,
        keywords: ["layout", "workspace"],
        icon: <PanelLeft className="w-4.5 h-4.5 stroke-[1.5]" />,
        action: () => {
          setPaneMode(3);
          onClose();
        },
      },
    );

    // Open notes folder
    if (notesFolder) {
      baseCommands.push({
        id: "open-folder",
        label: "Open Notes Folder in Finder",
        section: "System",
        keywords: ["reveal", "file manager", "directory"],
        icon: <FolderIcon className="w-4.5 h-4.5 stroke-[1.5]" />,
        action: async () => {
          try {
            await invoke("open_in_file_manager", { path: notesFolder });
            onClose();
          } catch (error) {
            console.error("Failed to open folder:", error);
            toast.error("Failed to open folder");
          }
        },
      });
    }

    // Settings and theme commands at the bottom
    baseCommands.push(
      {
        id: "settings",
        label: "Settings",
        section: "Settings",
        shortcut: `${mod} ,`,
        keywords: ["preferences"],
        icon: <SettingsIcon className="w-4.5 h-4.5 stroke-[1.5]" />,
        action: () => {
          onOpenSettings?.();
          onClose();
        },
      },
      {
        id: "settings-shortcuts",
        label: "Keyboard Shortcuts",
        section: "Settings",
        shortcut: `${mod} /`,
        keywords: ["help", "markdown guide"],
        icon: <KeyboardIcon className="w-4.5 h-4.5 stroke-[1.5]" />,
        action: () => {
          onOpenSettingsTab?.("shortcuts");
          onClose();
        },
      },
      {
        id: "settings-about",
        label: "About Sly",
        section: "Settings",
        keywords: ["version", "updates"],
        icon: <InfoIcon className="w-4.5 h-4.5 stroke-[1.5]" />,
        action: () => {
          onOpenSettingsTab?.("about");
          onClose();
        },
      },
      {
        id: "theme-mode-light",
        label: "Use Light Mode",
        section: "Settings",
        keywords: ["appearance", "theme"],
        icon: <SwatchIcon className="w-4.5 h-4.5 stroke-[1.5]" />,
        action: () => {
          setTheme("light");
          onClose();
        },
      },
      {
        id: "theme-mode-dark",
        label: "Use Dark Mode",
        section: "Settings",
        keywords: ["appearance", "theme"],
        icon: <SwatchIcon className="w-4.5 h-4.5 stroke-[1.5]" />,
        action: () => {
          setTheme("dark");
          onClose();
        },
      },
      {
        id: "theme-mode-system",
        label: "Use System Appearance",
        section: "Settings",
        keywords: ["appearance", "theme", "auto"],
        icon: <SwatchIcon className="w-4.5 h-4.5 stroke-[1.5]" />,
        action: () => {
          setTheme("system");
          onClose();
        },
      },
      {
        id: "change-theme",
        label: "Change Theme...",
        section: "Settings",
        keywords: ["appearance", "preset", "colors", "swatch"],
        icon: <SwatchIcon className="w-4.5 h-4.5 stroke-[1.5]" />,
        action: () => {
          const resolvedPresetKind = theme === "system" ? resolvedTheme : theme;
          const selectedPresetId =
            resolvedPresetKind === "dark" ? darkPresetId : lightPresetId;
          const selectedPresetIndex = (
            resolvedPresetKind === "dark" ? DARK_THEME_PRESETS : LIGHT_THEME_PRESETS
          ).findIndex((preset) => preset.id === selectedPresetId);
          setActiveSubmenu("theme");
          setThemePreview({
            kind: resolvedPresetKind,
            originalPresetId: selectedPresetId,
            committed: false,
          });
          setQuery("");
          setSelectedIndex(Math.max(selectedPresetIndex, 0));
        },
      },
      {
        id: "toggle-text-direction",
        label: `Use ${textDirection === "rtl" ? "Left-to-Right" : "Right-to-Left"} Text Direction`,
        section: "Settings",
        keywords: ["editor", "writing", "rtl", "ltr"],
        icon: <SettingsIcon className="w-4.5 h-4.5 stroke-[1.5]" />,
        action: () => {
          setTextDirection(textDirection === "rtl" ? "ltr" : "rtl");
          onClose();
        },
      },
      {
        id: "zoom-in",
        label: "Zoom In",
        section: "Navigation",
        shortcut: `${mod} =`,
        keywords: ["interface", "scale"],
        icon: <SettingsIcon className="w-4.5 h-4.5 stroke-[1.5]" />,
        action: () => {
          setInterfaceZoom((prev) => prev + 0.05);
          onClose();
        },
      },
      {
        id: "zoom-out",
        label: "Zoom Out",
        section: "Navigation",
        shortcut: `${mod} -`,
        keywords: ["interface", "scale"],
        icon: <SettingsIcon className="w-4.5 h-4.5 stroke-[1.5]" />,
        action: () => {
          setInterfaceZoom((prev) => prev - 0.05);
          onClose();
        },
      },
      {
        id: "zoom-reset",
        label: "Reset Zoom",
        section: "Navigation",
        shortcut: `${mod} 0`,
        keywords: ["interface", "scale"],
        icon: <SettingsIcon className="w-4.5 h-4.5 stroke-[1.5]" />,
        action: () => {
          setInterfaceZoom(1);
          onClose();
        },
      },
    );

    return baseCommands;
  }, [
    createNote,
    currentNote,
    confirmDeletions,
    deleteNote,
    editorRef,
    flushPendingSave,
    onClose,
    onOpenSettings,
    onOpenSettingsTab,
    onShowNotes,
    onShowTasks,
    onOpenTaskCapture,
    onReloadCurrentNote,
    setTheme,
    theme,
    resolvedTheme,
    darkPresetId,
    lightPresetId,
    setInterfaceZoom,
    setPaneMode,
    textDirection,
    setTextDirection,
    gitEnabled,
    gitAvailable,
    status,
    commit,
    sync,
    isSyncing,
    selectedView,
    selectedTask,
    selectedTaskId,
    selectedTaskIds,
    tagNames,
    selectView,
    selectTag,
    setCompleted,
    deleteTaskAction,
    refreshTasks,
    selectNote,
    refreshNotes,
    settings,
    pinNote,
    unpinNote,
    focusMode,
    onToggleFocusMode,
    onToggleRightPanel,
    rightPanelVisible,
    notesFolder,
  ]);

  const activeThemePresets = useMemo(() => {
    const resolvedPresetKind = theme === "system" ? resolvedTheme : theme;
    return resolvedPresetKind === "dark" ? DARK_THEME_PRESETS : LIGHT_THEME_PRESETS;
  }, [resolvedTheme, theme]);

  const activeThemeKind = theme === "system" ? resolvedTheme : theme;
  const activeThemePresetId =
    activeThemeKind === "dark" ? darkPresetId : lightPresetId;
  const setActiveThemePreset =
    activeThemeKind === "dark" ? setDarkPresetId : setLightPresetId;

  const themeCommands = useMemo<AppCommand[]>(() => {
    return activeThemePresets.map((preset) => ({
      id: `theme-preset-${preset.id}`,
      label: `${preset.label}${preset.id === activeThemePresetId ? " (Current)" : ""}`,
      section: "Settings",
      keywords: ["theme", "appearance", "preset", activeThemeKind],
      icon: <SwatchIcon className="w-4.5 h-4.5 stroke-[1.5]" />,
      action: () => {
        setThemePreview((preview) =>
          preview ? { ...preview, committed: true } : preview,
        );
        setActiveThemePreset(preset.id);
        toast.success(`Theme changed to ${preset.label}`);
        onClose();
      },
    }));
  }, [
    activeThemeKind,
    activeThemePresetId,
    activeThemePresets,
    onClose,
    setActiveThemePreset,
  ]);

  // Debounced search using Tantivy (local state, doesn't affect sidebar)
  useEffect(() => {
    if (!open) return;

    const trimmed = query.trim();
    if (!trimmed) {
      setLocalSearchResults([]);
      return;
    }

    // Debounce search calls
    const timer = setTimeout(async () => {
      try {
        const results = await invoke<
          {
            id: string;
            title: string;
            preview: string;
            modified: number;
            score: number;
          }[]
        >("search_notes", { query: trimmed });
        setLocalSearchResults(results);
      } catch (err) {
        console.error("Search failed:", err);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [query, open]);

  // Clear local search when palette closes
  useEffect(() => {
    if (!open) {
      setLocalSearchResults([]);
    }
  }, [open]);

  // Use search results when searching, otherwise show all notes
  const filteredNotes = useMemo(() => {
    if (!query.trim()) return notes;
    return localSearchResults;
  }, [query, notes, localSearchResults]);

  const filteredTasks = useMemo(() => {
    const trimmed = query.trim();
    if (activeSubmenu !== "root" || !trimmed) return [];

    return tasks
      .filter((task) => taskMatchesQuery(task, trimmed))
      .sort((a, b) => {
        if (a.starred !== b.starred) return a.starred ? -1 : 1;
        return b.createdAt.localeCompare(a.createdAt);
      });
  }, [activeSubmenu, query, tasks]);

  // Memoize filtered commands
  const activeCommands = activeSubmenu === "theme" ? themeCommands : commands;

  const filteredCommands = useMemo(
    () => activeCommands.filter((cmd) => commandMatchesQuery(cmd, query)),
    [query, activeCommands],
  );

  const recentCommands = useMemo(() => {
    if (activeSubmenu !== "root" || query.trim()) return [];

    const commandById = new Map(commands.map((cmd) => [cmd.id, cmd]));
    return recentCommandIds
      .map((id) => commandById.get(id))
      .filter((cmd): cmd is AppCommand => Boolean(cmd))
      .slice(0, MAX_RECENT_COMMANDS);
  }, [activeSubmenu, commands, query, recentCommandIds]);

  const primaryCommands = useMemo(() => {
    if (recentCommands.length === 0) return filteredCommands;
    const recentIds = new Set(recentCommands.map((cmd) => cmd.id));
    return filteredCommands.filter((cmd) => !recentIds.has(cmd.id));
  }, [filteredCommands, recentCommands]);

  const commandItems = useMemo(
    () => [...recentCommands, ...primaryCommands],
    [primaryCommands, recentCommands],
  );

  useEffect(() => {
    if (activeSubmenu !== "theme") return;
    const highlightedTheme = commandItems[selectedIndex];
    if (!highlightedTheme?.id.startsWith("theme-preset-")) return;

    const preset = activeThemePresets.find(
      (candidate) => `theme-preset-${candidate.id}` === highlightedTheme.id,
    );
    if (!preset) return;

    applyThemePreviewVariables(preset.id);
  }, [
    activeSubmenu,
    activeThemePresets,
    applyThemePreviewVariables,
    commandItems,
    selectedIndex,
  ]);

  // Memoize all items (commands first, then notes)
  const allItems = useMemo(
    () => [
      ...commandItems.map((cmd) => ({
        type: "command" as const,
        id: cmd.id,
        label: cmd.label,
        shortcut: cmd.shortcut,
        icon: cmd.icon,
        action: () => {
          rememberCommand(cmd.id);
          cmd.action();
        },
      })),
      ...(activeSubmenu === "root" ? filteredNotes.slice(0, 10) : []).map((note) => ({
        type: "note" as const,
        id: note.id,
        label: cleanTitle(note.title),
        preview: note.preview,
        action: () => {
          selectNote(note.id);
          onClose();
        },
      })),
      ...filteredTasks.slice(0, 10).map((task) => ({
        type: "task" as const,
        id: task.id,
        label: task.title,
        preview: [
          task.description,
          task.waitingFor ? `Waiting for ${task.waitingFor}` : "",
          task.tags?.length ? task.tags.map((tag) => `#${tag}`).join(" ") : "",
        ].find((value) => value.trim()) ?? TASK_VIEW_LABELS[deriveView(task, today)],
        action: () => {
          selectView(deriveView(task, today));
          selectTask(task.id);
          onShowTasks?.();
          onClose();
        },
      })),
    ],
    [
      activeSubmenu,
      filteredNotes,
      filteredTasks,
      commandItems,
      rememberCommand,
      selectNote,
      selectTask,
      selectView,
      onShowTasks,
      today,
      onClose,
    ],
  );

  // Reset state when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setActiveSubmenu("root");
      setThemePreview(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Reset selection when items change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selectedItem = listRef.current.querySelector(
        `[data-index="${selectedIndex}"]`,
      );
      selectedItem?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  const handleDeleteConfirm = useCallback(async () => {
    if (noteToDelete) {
      if (dontAskAgain) setConfirmDeletions(false);
      try {
        await deleteNote(noteToDelete);
        setNoteToDelete(null);
        setDeleteDialogOpen(false);
        onClose();
      } catch (error) {
        console.error("Failed to delete note:", error);
        toast.error("Failed to delete note");
      }
    }
  }, [noteToDelete, deleteNote, onClose, dontAskAgain, setConfirmDeletions]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          e.stopPropagation();
          setSelectedIndex((i) => Math.min(i + 1, allItems.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          e.stopPropagation();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          e.stopPropagation();
          if (allItems[selectedIndex]) {
            allItems[selectedIndex].action();
          }
          break;
        case "Escape":
          e.preventDefault();
          e.stopPropagation();
          if (activeSubmenu !== "root") {
            leaveThemeSubmenu();
            break;
          }
          handlePaletteClose();
          break;
      }
    },
    [
      activeSubmenu,
      allItems,
      handlePaletteClose,
      leaveThemeSubmenu,
      selectedIndex,
    ],
  );

  if (!open) return null;

  const commandsCount = commandItems.length;
  const notesCount =
    activeSubmenu === "root" ? Math.min(filteredNotes.length, 10) : 0;
  const tasksStartIndex = commandsCount + notesCount;

  return (
    <>
      <DialogShell
        onBackdropClick={handlePaletteClose}
        overlayClassName={
          activeSubmenu === "theme" ? "ui-dialog-overlay-transparent" : undefined
        }
        panelClassName="max-w-2xl h-full max-h-108 flex flex-col"
      >
        {/* Search input */}
        <div className="border-b border-border flex-none">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              activeSubmenu === "theme"
                ? `Choose a ${theme === "system" ? resolvedTheme : theme} theme...`
                : "Search notes, tasks, or type a command..."
            }
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="h-[var(--ui-control-height-prominent)] w-full border-0 bg-transparent px-4 py-3 text-[17px] text-text placeholder:text-text-muted/50 outline-none"
          />
        </div>

        {/* Results */}
        <div
          ref={listRef}
          className="ui-scrollbar-overlay overflow-y-auto h-full p-2.5 flex-1"
        >
          {allItems.length === 0 ? (
            <div className="text-sm font-medium opacity-50 text-text-muted p-2">
              No results found
            </div>
          ) : (
            <>
              {/* Commands section */}
              {commandItems.length > 0 && (
                <div className="space-y-1 mb-5">
                  {recentCommands.length > 0 && (
                    <>
                      <div className="text-sm font-medium text-text-muted px-2.5 py-1.5">
                        Recent
                      </div>
                      {recentCommands.map((cmd, i) => {
                        return (
                          <div key={cmd.id} data-index={i}>
                            <CommandItem
                              label={cmd.label}
                              shortcut={cmd.shortcut}
                              icon={cmd.icon}
                              isSelected={selectedIndex === i}
                              onClick={() => {
                                rememberCommand(cmd.id);
                                cmd.action();
                              }}
                            />
                          </div>
                        );
                      })}
                    </>
                  )}
                  <div className="flex items-center gap-2 px-2.5 py-1.5 text-sm font-medium text-text-muted">
                    {activeSubmenu !== "root" && (
                      <button
                        type="button"
                        onClick={() => {
                          leaveThemeSubmenu();
                        }}
                        className="flex h-6 w-6 items-center justify-center rounded-[var(--ui-radius-sm)] text-text-muted hover:bg-bg-muted hover:text-text"
                        aria-label="Back to commands"
                      >
                        <ArrowLeft className="h-4 w-4 stroke-[1.6]" />
                      </button>
                    )}
                    <span>
                      {activeSubmenu === "theme" ? "Themes" : "Commands"}
                    </span>
                  </div>
                  {primaryCommands.map((cmd, i) => {
                    const index = recentCommands.length + i;
                    return (
                      <div key={cmd.id} data-index={index}>
                        <CommandItem
                          label={cmd.label}
                          shortcut={cmd.shortcut}
                          icon={cmd.icon}
                          isSelected={selectedIndex === index}
                          onClick={() => {
                            rememberCommand(cmd.id);
                            cmd.action();
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Notes section */}
              {activeSubmenu === "root" && filteredNotes.length > 0 && (
                <div className="space-y-1 mb-5">
                  <div className="text-sm font-medium text-text-muted px-2.5 py-1.5">
                    Notes
                  </div>
                  {filteredNotes.slice(0, 10).map((note, i) => {
                    const title = cleanTitle(note.title);
                    const firstLetter = getDisplayInitial(note.title);
                    const cleanSubtitle = cleanPreviewText(note.preview);
                    const index = commandsCount + i;
                    return (
                      <div key={note.id} data-index={index}>
                        <CommandItem
                          label={title}
                          subtitle={cleanSubtitle}
                          iconText={firstLetter}
                          variant="note"
                          isSelected={selectedIndex === index}
                          onClick={allItems[index].action}
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Tasks section */}
              {activeSubmenu === "root" && filteredTasks.length > 0 && (
                <div className="space-y-1">
                  <div className="text-sm font-medium text-text-muted px-2.5 py-1.5">
                    Tasks
                  </div>
                  {filteredTasks.slice(0, 10).map((task, i) => {
                    const index = tasksStartIndex + i;
                    const item = allItems[index];
                    return (
                      <div key={task.id} data-index={index}>
                        <CommandItem
                          label={task.title}
                          subtitle={item?.type === "task" ? item.preview : undefined}
                          icon={<CheckSquare className="w-4.5 h-4.5 stroke-[1.7]" />}
                          variant="command"
                          isSelected={selectedIndex === index}
                          onClick={item?.action}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </DialogShell>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete note?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the note and all its content. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label
            htmlFor={dontAskAgainId}
            className="flex items-center gap-2 pt-1 cursor-pointer select-none"
          >
            <Checkbox
              id={dontAskAgainId}
              checked={dontAskAgain}
              onCheckedChange={(checked) => setDontAskAgain(checked === true)}
            />
            <span className="text-sm text-text-muted">Don't ask again</span>
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

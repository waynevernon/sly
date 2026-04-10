import {
  memo,
  startTransition,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  lazy,
  Suspense,
} from "react";
import { PanelLeft, PanelRight } from "lucide-react";
import { toast } from "sonner";
import {
  NotesProvider,
  useNotesActions,
  useNotesData,
} from "./context/NotesContext";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { listen } from "@tauri-apps/api/event";
import { isTauri } from "@tauri-apps/api/core";
import { GitProvider } from "./context/GitContext";
import {
  Button,
  IconButton,
  LoadingSpinner,
  TooltipProvider,
  Toaster,
} from "./components/ui";
import { WorkspaceNavigation } from "./components/layout/WorkspaceNavigation";
import { RightPanel } from "./components/layout/RightPanel";
import type { RightPanelAssistantProps } from "./components/layout/RightPanelAssistant";
import { Editor } from "./components/editor/Editor";
import { TaskDetailPanel } from "./components/tasks/TaskDetailPanel";
import { TasksProvider } from "./context/TasksContext";
import type { Editor as TiptapEditor } from "@tiptap/react";
import { FolderPicker } from "./components/layout/FolderPicker";
import { SettingsPage } from "./components/settings";
import type { PaneMode, RightPanelTab } from "./types/note";
import type { SettingsTab } from "./components/settings/SettingsPage";
import {
  check as checkForUpdate,
} from "@tauri-apps/plugin-updater";
import { getCurrentWindow } from "@tauri-apps/api/window";
import * as aiService from "./services/ai";
import * as assistantService from "./services/assistant";
import type { AiProvider } from "./services/ai";
import type {
  AssistantAssistantTurn,
  AssistantProposal,
  AssistantThreadState,
  AssistantTurn,
} from "./types/assistant";
import { isMac, mod } from "./lib/platform";
import { UpdateToast } from "./components/updater/UpdateToast";
import {
  applyLineReplacement,
  buildAssistantDocumentContext,
  getAutoAssistantScope,
  hashText,
  hasMeaningfulAssistantSelection,
  isProposalRangeWithinScope,
  serializeEditorMarkdown,
  type AssistantSelectionSnapshot,
} from "./lib/assistant";
import type { WorkspaceEditorData } from "./components/editor/Editor";

const loadCommandPalette = () => import("./components/command-palette/CommandPalette");
const loadPreviewApp = () => import("./components/preview/PreviewApp");
const loadWorkspaceNoteApp = () =>
  import("./components/preview/WorkspaceNoteApp");

const CommandPalette = lazy(() =>
  loadCommandPalette().then((module) => ({ default: module.CommandPalette })),
);
const PreviewApp = lazy(() =>
  loadPreviewApp().then((module) => ({ default: module.PreviewApp })),
);
const WorkspaceNoteApp = lazy(() =>
  loadWorkspaceNoteApp().then((module) => ({
    default: module.WorkspaceNoteApp,
  })),
);

type DetachedSource = "workspace-note" | "external-file";
type DetachedPresentation = "interactive" | "print";

function getWindowMode():
  | { mode: "folder" }
  | {
      mode: "detached";
      source: DetachedSource;
      presentation: DetachedPresentation;
      filePath: string | null;
      noteId: string | null;
    } {
  const params = new URLSearchParams(window.location.search);
  const rawMode = params.get("mode");
  const file = params.get("file");
  const noteId = params.get("note");

  if (rawMode === "preview" && file) {
    return {
      mode: "detached",
      source: "external-file",
      presentation: "interactive",
      filePath: file,
      noteId: null,
    };
  }

  if (rawMode === "print" && file) {
    return {
      mode: "detached",
      source: "external-file",
      presentation: "print",
      filePath: file,
      noteId: null,
    };
  }

  if (rawMode === "detached") {
    const source = params.get("source");
    const presentation = params.get("presentation");

    if (
      source === "workspace-note" &&
      presentation === "interactive" &&
      noteId
    ) {
      return {
        mode: "detached",
        source,
        presentation,
        filePath: null,
        noteId,
      };
    }

    if (
      source === "external-file" &&
      (presentation === "interactive" || presentation === "print") &&
      file
    ) {
      return {
        mode: "detached",
        source,
        presentation,
        filePath: file,
        noteId: null,
      };
    }
  }

  return { mode: "folder" };
}

type ViewState = "notes" | "settings";
type WorkspaceMode = "notes" | "tasks";

function formatPaneModeLabel(mode: PaneMode): string {
  if (mode === 1) return "1 Pane";
  if (mode === 2) return "2 Panes";
  return "3 Panes";
}

function getNextPaneMode(mode: PaneMode): PaneMode {
  return mode === 1 ? 3 : ((mode - 1) as PaneMode);
}

function getDefaultAssistantProvider(
  providers: AiProvider[],
): AiProvider {
  return providers[0] ?? "claude";
}

function createAssistantThreadState(
  provider: AiProvider,
): AssistantThreadState {
  return {
    provider,
    scope: "note",
    scopeManual: false,
    draft: "",
    turns: [],
    pending: false,
    lastSuccessfulSnapshotHash: null,
  };
}

function getMeaningfulEditorSelectionSnapshot(
  editor: TiptapEditor | null,
): AssistantSelectionSnapshot | null {
  if (!editor || !hasMeaningfulAssistantSelection(editor)) {
    return null;
  }

  const { from, to } = editor.state.selection;
  return { from, to };
}

function createAssistantTurnId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toAssistantHistory(turns: AssistantTurn[]) {
  return turns
    .filter(
      (turn): turn is Extract<AssistantTurn, { kind: "user" | "assistant" }> =>
        turn.kind === "user" || turn.kind === "assistant",
    )
    .slice(-8)
    .map((turn) => ({
      role: turn.kind,
      text: turn.kind === "user" ? turn.text : turn.replyText,
    }));
}

function FullScreenFallback({ label }: { label: string }) {
  return (
    <div className="h-screen flex items-center justify-center bg-bg-secondary">
      <div className="text-text-muted/70 text-sm flex items-center gap-1.5 font-medium">
        <LoadingSpinner size="lg" className="text-current" />
        {label}
      </div>
    </div>
  );
}

function PreviewFallback() {
  return <FullScreenFallback label="Opening preview..." />;
}

interface WorkspaceMainProps {
  paneMode: PaneMode;
  workspaceMode: WorkspaceMode;
  focusMode: boolean;
  showRightPanel: boolean;
  rightPanelWidth: number;
  rightPanelTab: RightPanelTab;
  editorInstance: TiptapEditor | null;
  editorScrollContainer: HTMLDivElement | null;
  currentNoteId: string | null;
  currentAssistantSelection: AssistantSelectionSnapshot | null;
  assistantProps: RightPanelAssistantProps;
  workspaceEditorData: WorkspaceEditorData;
  onOpenSettings: (tab?: "general" | "editor" | "shortcuts" | "about") => void;
  onEditorSourceModeChange: (sourceMode: boolean) => void;
  onRegisterScrollContainer: (container: HTMLDivElement | null) => void;
  onRegisterFlushPendingSave: (
    flushPendingSave: (() => Promise<void>) | null,
  ) => void;
  onEditorReady: (editor: TiptapEditor | null) => void;
  onRightPanelTabChange: (tab: RightPanelTab) => void;
  onRightPanelWidthChange: (width: number) => void;
}

const WorkspaceMain = memo(function WorkspaceMain({
  paneMode,
  workspaceMode,
  focusMode,
  showRightPanel,
  rightPanelWidth,
  rightPanelTab,
  editorInstance,
  editorScrollContainer,
  currentNoteId,
  currentAssistantSelection,
  assistantProps,
  workspaceEditorData,
  onOpenSettings,
  onEditorSourceModeChange,
  onRegisterScrollContainer,
  onRegisterFlushPendingSave,
  onEditorReady,
  onRightPanelTabChange,
  onRightPanelWidthChange,
}: WorkspaceMainProps) {
  const isTasksModeActive = workspaceMode === "tasks";

  useEffect(() => {
    if (!isTasksModeActive) {
      return;
    }

    onEditorReady(null);
    onRegisterScrollContainer(null);
    onRegisterFlushPendingSave(null);
    onEditorSourceModeChange(false);
  }, [
    isTasksModeActive,
    onEditorReady,
    onEditorSourceModeChange,
    onRegisterFlushPendingSave,
    onRegisterScrollContainer,
  ]);

  return (
    <>
      <WorkspaceNavigation
        paneMode={focusMode ? 1 : paneMode}
        workspaceMode={workspaceMode}
        onOpenSettings={onOpenSettings}
      />
      <div className="flex min-w-0 flex-1">
        {isTasksModeActive ? (
          <TaskDetailPanel />
        ) : (
          <>
            <Editor
              paneMode={paneMode}
              focusMode={focusMode}
              hasPinnedRightTitlebarControl={!focusMode && !showRightPanel}
              workspaceMode={workspaceEditorData}
              assistantSelection={currentAssistantSelection}
              onSourceModeChange={onEditorSourceModeChange}
              onRegisterScrollContainer={onRegisterScrollContainer}
              onRegisterFlushPendingSave={onRegisterFlushPendingSave}
              onEditorReady={onEditorReady}
            />
            <RightPanel
              editor={editorInstance}
              scrollContainer={editorScrollContainer}
              noteId={currentNoteId}
              hasNote={Boolean(currentNoteId)}
              visible={showRightPanel}
              width={rightPanelWidth}
              activeTab={rightPanelTab}
              onTabChange={onRightPanelTabChange}
              onWidthChange={onRightPanelWidthChange}
              assistantProps={assistantProps}
            />
          </>
        )}
      </div>
    </>
  );
});

function TitlebarPaneSwitch({
  paneMode,
  onCyclePaneMode,
  rightPanelVisible,
  onToggleRightPanel,
  tasksEnabled = false,
  isTasksModeActive = false,
  onShowNotes,
  onShowTasks,
  showRightPanelToggle = true,
}: {
  paneMode: PaneMode;
  onCyclePaneMode: () => void;
  rightPanelVisible: boolean;
  onToggleRightPanel: () => void;
  tasksEnabled?: boolean;
  isTasksModeActive?: boolean;
  onShowNotes?: () => void;
  onShowTasks?: () => void;
  showRightPanelToggle?: boolean;
}) {
  return (
    <>
      <div className="ui-titlebar-pane-switch" data-tauri-drag-region>
        <div className="ui-titlebar-control-cluster titlebar-no-drag flex items-center">
          <IconButton
            onClick={onCyclePaneMode}
            title={`Workspace layout: ${formatPaneModeLabel(paneMode)}. Next: ${formatPaneModeLabel(getNextPaneMode(paneMode))} (${mod}${isMac ? "" : "+"}\\)`}
            className="shrink-0"
          >
            <PanelLeft className="w-4.5 h-4.5 stroke-[1.5]" />
          </IconButton>
        </div>
      </div>
      {tasksEnabled && onShowNotes && onShowTasks && (
        <div className="ui-titlebar-mode-switch" data-tauri-drag-region>
          <div className="titlebar-no-drag flex items-center rounded-[var(--ui-radius-lg)] border border-border bg-bg-secondary/92 p-1 backdrop-blur-sm">
            <Button
              type="button"
              size="xs"
              variant={isTasksModeActive ? "ghost" : "default"}
              onClick={onShowNotes}
              className="min-w-16"
            >
              Notes
            </Button>
            <Button
              type="button"
              size="xs"
              variant={isTasksModeActive ? "default" : "ghost"}
              onClick={onShowTasks}
              className="min-w-16"
            >
              Tasks
            </Button>
          </div>
        </div>
      )}
      {showRightPanelToggle && (
        <div
          className="ui-titlebar-pane-switch ui-titlebar-pane-switch-right"
          data-tauri-drag-region
        >
          <div className="ui-titlebar-control-cluster titlebar-no-drag flex items-center">
            <IconButton
              onClick={onToggleRightPanel}
              title={`${
                rightPanelVisible ? "Hide" : "Show"
              } Right Panel (${mod}${isMac ? "" : "+"}4)`}
              className="shrink-0"
            >
              <PanelRight className="w-4.5 h-4.5 stroke-[1.5]" />
            </IconButton>
          </div>
        </div>
      )}
    </>
  );
}

function AppContent() {
  const {
    notesFolder,
    isLoading,
    notes,
    scopedNotes,
    selectedNoteId,
    selectedNoteIds,
    currentNote,
    settings,
    searchQuery,
    searchResults,
    hasExternalChanges,
    reloadVersion,
  } = useNotesData();
  const {
    clearNoteSelection,
    createNote,
    duplicateNote,
    consumePendingNewNote,
    pinNote,
    renameNote,
    reloadCurrentNote,
    saveNote,
    selectNote,
    selectNoteRange,
    selectAllVisibleNotes,
    syncNotesFolder,
    unpinNote,
  } = useNotesActions();
  const {
    interfaceZoom,
    setInterfaceZoom,
    paneMode,
    setPaneMode,
    cyclePaneMode,
    rightPanelVisible,
    rightPanelWidth,
    rightPanelTab,
    setRightPanelVisible,
    setRightPanelWidth,
    setRightPanelTab,
  } = useTheme();
  const interfaceZoomRef = useRef(interfaceZoom);
  interfaceZoomRef.current = interfaceZoom;
  const paneModeRef = useRef(paneMode);
  paneModeRef.current = paneMode;
  const rightPanelVisibleRef = useRef(rightPanelVisible);
  rightPanelVisibleRef.current = rightPanelVisible;
  const currentNoteRef = useRef(currentNote);
  currentNoteRef.current = currentNote;
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [view, setView] = useState<ViewState>("notes");
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("notes");
  const [focusMode, setFocusMode] = useState(false);
  const [flushPendingSave, setFlushPendingSave] = useState<
    (() => Promise<void>) | null
  >(null);
  const handleRegisterFlushPendingSave = useCallback(
    (nextFlushPendingSave: (() => Promise<void>) | null) => {
      setFlushPendingSave(() => nextFlushPendingSave);
    },
    [],
  );
  const editorRef = useRef<TiptapEditor | null>(null);
  const [editorInstance, setEditorInstance] = useState<TiptapEditor | null>(null);
  const [editorScrollContainer, setEditorScrollContainer] =
    useState<HTMLDivElement | null>(null);
  const [editorSourceMode, setEditorSourceMode] = useState(false);
  const [availableAssistantProviders, setAvailableAssistantProviders] = useState<
    AiProvider[]
  >([]);
  const [assistantProvidersLoaded, setAssistantProvidersLoaded] = useState(false);
  const [assistantThreads, setAssistantThreads] = useState<
    Record<string, AssistantThreadState>
  >({});
  const [assistantSelectionState, setAssistantSelectionState] = useState<{
    noteId: string;
    selection: AssistantSelectionSnapshot;
  } | null>(null);
  const lastAssistantSelectionRef = useRef<{
    noteId: string;
    selection: AssistantSelectionSnapshot;
  } | null>(null);

  // Refs for volatile state consumed by the keydown handler so the effect
  // doesn't need to re-register on every note selection or filter change.
  const focusModeRef = useRef(focusMode);
  focusModeRef.current = focusMode;
  const viewRef = useRef(view);
  viewRef.current = view;
  const selectedNoteIdKbRef = useRef(selectedNoteId);
  selectedNoteIdKbRef.current = selectedNoteId;
  const selectedNoteIdsKbRef = useRef(selectedNoteIds);
  selectedNoteIdsKbRef.current = selectedNoteIds;
  const isTasksModeActive = workspaceMode === "tasks";
  const isTasksModeActiveRef = useRef(isTasksModeActive);
  isTasksModeActiveRef.current = isTasksModeActive;
  const tasksEnabled = settings?.tasksEnabled ?? false;
  const showRightPanel =
    rightPanelVisible &&
    !focusMode &&
    !editorSourceMode &&
    !isTasksModeActive;

  useEffect(() => {
    if (!tasksEnabled && workspaceMode !== "notes") {
      setWorkspaceMode("notes");
    }
  }, [tasksEnabled, workspaceMode]);

  useEffect(() => {
    if (isTasksModeActive && paneMode === 1) {
      setPaneMode(2);
    }
  }, [isTasksModeActive, paneMode, setPaneMode]);

  // Listen for set-notes-folder event from CLI (sly .)
  // Placed here in AppContent where both NotesContext and ThemeContext are available
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    listen<string>("set-notes-folder", async (event) => {
      await syncNotesFolder(event.payload);
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [syncNotesFolder]);

  useEffect(() => {
    const preloadSurfaces = () => {
      void loadCommandPalette();
    };

    if ("requestIdleCallback" in window) {
      const idleId = window.requestIdleCallback(preloadSurfaces);
      return () => window.cancelIdleCallback(idleId);
    }

    const timeoutId = globalThis.setTimeout(preloadSurfaces, 300);
    return () => globalThis.clearTimeout(timeoutId);
  }, []);

  const refreshAssistantProviders = useCallback(async () => {
    setAssistantProvidersLoaded(false);
    try {
      const providers = await aiService.getAvailableAiProviders();
      setAvailableAssistantProviders(providers);
    } catch (error) {
      console.error("Failed to detect assistant providers:", error);
      setAvailableAssistantProviders([]);
    } finally {
      setAssistantProvidersLoaded(true);
    }
  }, []);

  useEffect(() => {
    let active = true;

    const loadProviders = async () => {
      setAssistantProvidersLoaded(false);
      try {
        const providers = await aiService.getAvailableAiProviders();
        if (active) {
          setAvailableAssistantProviders(providers);
        }
      } catch (error) {
        console.error("Failed to detect assistant providers:", error);
        if (active) {
          setAvailableAssistantProviders([]);
        }
      } finally {
        if (active) {
          setAssistantProvidersLoaded(true);
        }
      }
    };

    void loadProviders();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!currentNote?.id) {
      return;
    }

    const defaultProvider = getDefaultAssistantProvider(availableAssistantProviders);
    setAssistantThreads((prev) => {
      const existing = prev[currentNote.id];
      if (!existing) {
        return {
          ...prev,
          [currentNote.id]: createAssistantThreadState(defaultProvider),
        };
      }
      if (
        availableAssistantProviders.length > 0 &&
        !availableAssistantProviders.includes(existing.provider)
      ) {
        return {
          ...prev,
          [currentNote.id]: {
            ...existing,
            provider: defaultProvider,
          },
        };
      }
      return prev;
    });
  }, [currentNote?.id, availableAssistantProviders]);

  useEffect(() => {
    if (!currentNote?.id) {
      lastAssistantSelectionRef.current = null;
      setAssistantSelectionState(null);
      return;
    }

    const storedSelection = lastAssistantSelectionRef.current;
    if (storedSelection && storedSelection.noteId !== currentNote.id) {
      lastAssistantSelectionRef.current = null;
      setAssistantSelectionState(null);
    }
  }, [currentNote?.id]);

  const toggleFocusMode = useCallback(() => {
    setFocusMode((prev) => {
      // Don't enter focus mode without a selected note
      if (!prev && !selectedNoteIdKbRef.current) return prev;
      return !prev;
    });
  }, []); // stable — reads selectedNoteId via ref

  const [settingsInitialTab, setSettingsInitialTab] = useState<
    SettingsTab | undefined
  >(undefined);
  const [settingsKey, setSettingsKey] = useState(0);

  const openSettings = useCallback(
    (tab?: "general" | "editor" | "shortcuts" | "about") => {
      const validTab = typeof tab === "string" ? tab : undefined;
      setPaletteOpen(false);
      setSettingsInitialTab(validTab);
      setSettingsKey((k) => k + 1);
      setView("settings");
    },
    [],
  );

  const closeSettings = useCallback(() => {
    setSettingsInitialTab(undefined);
    setView("notes");
  }, []);

  const updateCurrentAssistantThread = useCallback(
    (updater: (thread: AssistantThreadState) => AssistantThreadState) => {
      if (!currentNote?.id) {
        return;
      }

      const defaultProvider = getDefaultAssistantProvider(availableAssistantProviders);
      setAssistantThreads((prev) => {
        const currentThread =
          prev[currentNote.id] ?? createAssistantThreadState(defaultProvider);
        const nextThread = updater(currentThread);
        if (nextThread === currentThread && prev[currentNote.id]) {
          return prev;
        }

        return {
          ...prev,
          [currentNote.id]: nextThread,
        };
      });
    },
    [availableAssistantProviders, currentNote?.id],
  );

  const currentAssistantThread = currentNote
    ? assistantThreads[currentNote.id] ??
      createAssistantThreadState(
        getDefaultAssistantProvider(availableAssistantProviders),
      )
    : null;
  const currentAssistantSelection =
    currentNote && assistantSelectionState?.noteId === currentNote.id
      ? assistantSelectionState.selection
      : null;
  const assistantSyncActive = showRightPanel && rightPanelTab === "assistant";

  const syncAssistantSelectionFromEditor = useCallback(
    (options?: { clearWhenEmpty?: boolean }) => {
      const currentEditor = editorRef.current;
      const noteId = currentNote?.id;
      if (!noteId || !currentEditor) {
        return null;
      }

      const nextSelection = getMeaningfulEditorSelectionSnapshot(currentEditor);
      if (nextSelection) {
        const nextStoredSelection = {
          noteId,
          selection: nextSelection,
        };
        lastAssistantSelectionRef.current = nextStoredSelection;
        startTransition(() => {
          setAssistantSelectionState(nextStoredSelection);
        });
        return nextSelection;
      }

      if (options?.clearWhenEmpty !== false) {
        lastAssistantSelectionRef.current = null;
        startTransition(() => {
          setAssistantSelectionState(null);
        });
      }

      return null;
    },
    [currentNote?.id],
  );

  const syncAutoAssistantScopeFromEditor = useCallback(
    (
      selection: AssistantSelectionSnapshot | null,
      threadOverride?: AssistantThreadState | null,
    ) => {
      const noteId = currentNote?.id;
      const currentEditor = editorRef.current;
      const threadState = threadOverride ?? currentAssistantThread;

      if (!noteId || !currentEditor || !threadState || threadState.scopeManual) {
        return threadState?.scope ?? "note";
      }

      const nextScope = getAutoAssistantScope(currentEditor, selection);
      if (threadState.scope !== nextScope) {
        updateCurrentAssistantThread((thread) => {
          if (thread.scopeManual || thread.scope === nextScope) {
            return thread;
          }

          return {
            ...thread,
            scope: nextScope,
          };
        });
      }

      return nextScope;
    },
    [currentAssistantThread, currentNote?.id, updateCurrentAssistantThread],
  );

  useEffect(() => {
    if (!assistantSyncActive || !currentNote?.id || !editorInstance) {
      return;
    }

    const syncStoredAssistantSelection = () => {
      syncAssistantSelectionFromEditor({ clearWhenEmpty: editorInstance.isFocused });
    };

    syncStoredAssistantSelection();
    editorInstance.on("selectionUpdate", syncStoredAssistantSelection);

    return () => {
      editorInstance.off("selectionUpdate", syncStoredAssistantSelection);
    };
  }, [assistantSyncActive, currentNote?.id, editorInstance, syncAssistantSelectionFromEditor]);

  useEffect(() => {
    if (!assistantSyncActive || !currentNote?.id || !editorInstance) {
      return;
    }

    const syncAutoAssistantScope = () => {
      const storedSelection = syncAssistantSelectionFromEditor({
        clearWhenEmpty: editorInstance.isFocused,
      });
      syncAutoAssistantScopeFromEditor(storedSelection);
    };

    syncAutoAssistantScope();
    editorInstance.on("selectionUpdate", syncAutoAssistantScope);

    return () => {
      editorInstance.off("selectionUpdate", syncAutoAssistantScope);
    };
  }, [
    assistantSyncActive,
    currentNote?.id,
    editorInstance,
    syncAssistantSelectionFromEditor,
    syncAutoAssistantScopeFromEditor,
  ]);

  const applyPaneModeSelection = useCallback(
    (mode: PaneMode) => {
      setFocusMode(false);
      setPaneMode(mode);
    },
    [setPaneMode],
  );

  const toggleRightPanel = useCallback(() => {
    if (isTasksModeActiveRef.current) {
      return;
    }
    setRightPanelVisible(!rightPanelVisibleRef.current);
  }, [setRightPanelVisible]);

  const showNotesMode = useCallback(() => {
    setWorkspaceMode("notes");
  }, []);

  const showTasksMode = useCallback(() => {
    clearNoteSelection();
    setFocusMode(false);
    setEditorSourceMode(false);
    if (paneModeRef.current === 1) {
      setPaneMode(2);
    }
    setWorkspaceMode("tasks");
  }, [clearNoteSelection, setPaneMode]);

  useEffect(() => {
    let cancelled = false;
    let unlistenOpenSettings: (() => void) | undefined;
    let unlistenOpenSettingsAbout: (() => void) | undefined;
    let unlistenSetPaneMode: (() => void) | undefined;
    let unlistenToggleFocusMode: (() => void) | undefined;
    let unlistenToggleRightPanel: (() => void) | undefined;

    listen("open-settings", () => {
      openSettings();
    }).then((fn) => {
      if (cancelled) fn();
      else unlistenOpenSettings = fn;
    });

    listen("open-settings-about", () => {
      openSettings("about");
    }).then((fn) => {
      if (cancelled) fn();
      else unlistenOpenSettingsAbout = fn;
    });

    listen<number>("set-pane-mode", (event) => {
      const nextPaneMode = event.payload;
      if (nextPaneMode === 1 || nextPaneMode === 2 || nextPaneMode === 3) {
        applyPaneModeSelection(nextPaneMode);
      }
    }).then((fn) => {
      if (cancelled) fn();
      else unlistenSetPaneMode = fn;
    });

    listen("toggle-focus-mode", () => {
      toggleFocusMode();
    }).then((fn) => {
      if (cancelled) fn();
      else unlistenToggleFocusMode = fn;
    });

    listen("toggle-right-panel", () => {
      toggleRightPanel();
    }).then((fn) => {
      if (cancelled) fn();
      else unlistenToggleRightPanel = fn;
    });

    return () => {
      cancelled = true;
      unlistenOpenSettings?.();
      unlistenOpenSettingsAbout?.();
      unlistenSetPaneMode?.();
      unlistenToggleFocusMode?.();
      unlistenToggleRightPanel?.();
    };
  }, [applyPaneModeSelection, openSettings, toggleFocusMode, toggleRightPanel]);

  const handleAssistantProviderChange = useCallback(
    (provider: AiProvider) => {
      updateCurrentAssistantThread((thread) => ({
        ...thread,
        provider,
      }));
    },
    [updateCurrentAssistantThread],
  );

  const handleAssistantScopeChange = useCallback(
    (scope: AssistantThreadState["scope"]) => {
      updateCurrentAssistantThread((thread) => ({
        ...thread,
        scope,
        scopeManual: true,
      }));
    },
    [updateCurrentAssistantThread],
  );

  const handleAssistantDraftChange = useCallback(
    (draft: string) => {
      updateCurrentAssistantThread((thread) => ({
        ...thread,
        draft,
      }));
    },
    [updateCurrentAssistantThread],
  );

  const handleClearAssistantThread = useCallback(() => {
    const storedSelection = syncAssistantSelectionFromEditor();
    const nextScope = getAutoAssistantScope(editorRef.current, storedSelection);

    updateCurrentAssistantThread((thread) => ({
      ...thread,
      scope: nextScope,
      draft: "",
      scopeManual: false,
      turns: [],
      pending: false,
      lastSuccessfulSnapshotHash: null,
    }));
  }, [syncAssistantSelectionFromEditor, updateCurrentAssistantThread]);

  const handleAssistantSubmit = useCallback(async () => {
    if (!currentNote || !currentAssistantThread || currentAssistantThread.pending) {
      return;
    }

    const prompt = currentAssistantThread.draft.trim();
    if (!prompt) {
      return;
    }

    try {
      await flushPendingSave?.();

      const markdown = serializeEditorMarkdown(
        editorRef.current,
        currentNote.content,
      );
      const storedSelection = syncAssistantSelectionFromEditor();
      const effectiveScope = currentAssistantThread.scopeManual
        ? currentAssistantThread.scope
        : syncAutoAssistantScopeFromEditor(
            storedSelection,
            currentAssistantThread,
          );
      const context = buildAssistantDocumentContext(
        markdown,
        editorRef.current,
        effectiveScope,
        storedSelection,
      );
      const createdAt = Date.now();
      const userTurn: Extract<AssistantTurn, { kind: "user" }> = {
        id: createAssistantTurnId("assistant-user"),
        kind: "user",
        text: prompt,
        createdAt,
        scope: effectiveScope,
        scopeLabel: context.scopeLabel,
        lineLabel: context.lineLabel,
        snapshotHash: context.snapshotHash,
        notice: context.notice,
      };

      updateCurrentAssistantThread((thread) => ({
        ...thread,
        draft: "",
        pending: true,
        turns: [...thread.turns, userTurn],
      }));

      const result = await assistantService.executeAssistantTurn({
        provider: currentAssistantThread.provider,
        noteId: currentNote.id,
        notePath: currentNote.path,
        noteTitle: currentNote.title,
        scope: context.effectiveScope === "note" ? "note" : context.effectiveScope,
        scopeLabel: context.scopeLabel,
        startLine: context.startLine,
        endLine: context.endLine,
        snapshotHash: context.snapshotHash,
        numberedContent: context.numberedContent,
        userPrompt: prompt,
        history: toAssistantHistory(currentAssistantThread.turns),
        ollamaModel:
          currentAssistantThread.provider === "ollama"
            ? settings.ollamaModel || "qwen3:8b"
            : undefined,
      });

      const assistantTurn: AssistantAssistantTurn = {
        id: createAssistantTurnId("assistant-response"),
        kind: "assistant",
        replyText: result.replyText,
        proposals: result.proposals,
        createdAt: Date.now(),
        snapshotHash: context.snapshotHash,
        snapshotMarkdown: context.fullMarkdown,
        scopeStartLine: context.startLine,
        scopeEndLine: context.endLine,
        warning: result.warning ?? null,
        executionDir: result.executionDir ?? null,
        invalidReason: null,
        invalidProposalIds: [],
      };

      updateCurrentAssistantThread((thread) => ({
        ...thread,
        pending: false,
        turns: [...thread.turns, assistantTurn],
        lastSuccessfulSnapshotHash: context.snapshotHash,
      }));
    } catch (error) {
      console.error("[Assistant] Error:", error);
      const message =
        error instanceof Error ? error.message : "Unknown assistant error";
      updateCurrentAssistantThread((thread) => ({
        ...thread,
        pending: false,
        turns: [
          ...thread.turns,
          {
            id: createAssistantTurnId("assistant-system"),
            kind: "system",
            text: `Assistant request failed: ${message}`,
            createdAt: Date.now(),
          },
        ],
      }));
      toast.error(`Assistant request failed: ${message}`);
    }
  }, [
    currentAssistantThread,
    currentNote,
    flushPendingSave,
    settings.ollamaModel,
    syncAssistantSelectionFromEditor,
    syncAutoAssistantScopeFromEditor,
    updateCurrentAssistantThread,
  ]);

  const handleApplyAssistantProposal = useCallback(
    async (turn: AssistantAssistantTurn, proposal: AssistantProposal) => {
      if (!currentNote || !currentAssistantThread) {
        return;
      }

      try {
        await flushPendingSave?.();

        const latestMarkdown = serializeEditorMarkdown(
          editorRef.current,
          currentNote.content,
        );
        const latestHash = hashText(latestMarkdown);

        if (latestHash !== turn.snapshotHash) {
          updateCurrentAssistantThread((threadState) => ({
            ...threadState,
            turns: threadState.turns.flatMap((item) => {
              if (item.kind === "assistant" && item.id === turn.id) {
                return [{ ...item, stale: true }];
              }

              return [item];
            }).concat({
              id: createAssistantTurnId("assistant-system"),
              kind: "system",
              text: "The note changed after this proposal was generated. Send a new request before applying edits.",
              createdAt: Date.now(),
            }),
          }));
          return;
        }

        const totalLines = latestMarkdown.split(/\r?\n/).length;
        if (
          proposal.startLine < 1 ||
          proposal.endLine < proposal.startLine ||
          proposal.endLine > totalLines
        ) {
          updateCurrentAssistantThread((threadState) => ({
            ...threadState,
            turns: threadState.turns.map((item) => {
              if (item.kind !== "assistant" || item.id !== turn.id) {
                return item;
              }

              const invalidProposalIds = Array.from(
                new Set([...(item.invalidProposalIds ?? []), proposal.id]),
              );

              return {
                ...item,
                invalidProposalIds,
                invalidReason:
                  "One or more proposals from this response contained invalid line ranges and cannot be applied.",
              };
            }).concat({
              id: createAssistantTurnId("assistant-system"),
              kind: "system",
              text: `Could not apply “${proposal.title}” because the returned line range was invalid.`,
              createdAt: Date.now(),
            }),
          }));
          return;
        }

        if (
          !isProposalRangeWithinScope(
            proposal.startLine,
            proposal.endLine,
            turn.scopeStartLine,
            turn.scopeEndLine,
          )
        ) {
          updateCurrentAssistantThread((threadState) => ({
            ...threadState,
            turns: threadState.turns.map((item) => {
              if (item.kind !== "assistant" || item.id !== turn.id) {
                return item;
              }

              const invalidProposalIds = Array.from(
                new Set([...(item.invalidProposalIds ?? []), proposal.id]),
              );

              return {
                ...item,
                invalidProposalIds,
                invalidReason:
                  "One or more proposals from this response fell outside the scoped excerpt and cannot be applied.",
              };
            }).concat({
              id: createAssistantTurnId("assistant-system"),
              kind: "system",
              text: `Could not apply “${proposal.title}” because it falls outside the original ${turn.scopeStartLine === turn.scopeEndLine ? `line ${turn.scopeStartLine}` : `lines ${turn.scopeStartLine}-${turn.scopeEndLine}`} scope that Sly sent to the assistant.`,
              createdAt: Date.now(),
            }),
          }));
          return;
        }

        const nextMarkdown = applyLineReplacement(
          latestMarkdown,
          proposal.startLine,
          proposal.endLine,
          proposal.replacement,
        );

        await saveNote(nextMarkdown, currentNote.id);
        await reloadCurrentNote();

        updateCurrentAssistantThread((threadState) => ({
          ...threadState,
          turns: [
            ...threadState.turns,
            {
              id: createAssistantTurnId("assistant-system"),
              kind: "system",
              text: `Applied “${proposal.title}”.`,
              createdAt: Date.now(),
            },
          ],
        }));
        toast.success(`Applied “${proposal.title}”`);
      } catch (error) {
        console.error("[Assistant] Apply failed:", error);
        const message =
          error instanceof Error ? error.message : "Unknown apply error";
        updateCurrentAssistantThread((threadState) => ({
          ...threadState,
          turns: [
            ...threadState.turns,
            {
              id: createAssistantTurnId("assistant-system"),
              kind: "system",
              text: `Failed to apply “${proposal.title}”: ${message}`,
              createdAt: Date.now(),
            },
          ],
        }));
        toast.error(`Failed to apply “${proposal.title}”`);
      }
    },
    [
      currentAssistantThread,
      currentNote,
      flushPendingSave,
      reloadCurrentNote,
      saveNote,
      updateCurrentAssistantThread,
    ],
  );

  // Memoize display items to prevent unnecessary recalculations
  const displayItems = useMemo(() => {
    return searchQuery.trim() ? searchResults : scopedNotes;
  }, [scopedNotes, searchQuery, searchResults]);
  const displayItemsRef = useRef(displayItems);
  displayItemsRef.current = displayItems;

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target;
      const targetElement = target instanceof Element ? target : null;
      const isInEditor = !!targetElement?.closest(".ProseMirror");
      const isInInput =
        targetElement?.tagName === "INPUT" || targetElement?.tagName === "TEXTAREA";
      const isInNoteList =
        !!targetElement?.closest("[data-note-list]") ||
        !!document.activeElement?.closest("[data-note-list]");
      const isEditorEmpty =
        isInEditor && currentNoteRef.current?.content.trim() === "";

      // Cmd+, - Open settings (always works, even in settings)
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        openSettings();
        return;
      }

      // Cmd/Ctrl+/ or Cmd/Ctrl+? - Open shortcuts settings
      if (
        (e.metaKey || e.ctrlKey) &&
        (e.key === "?" ||
          e.key === "/" ||
          e.code === "Slash" ||
          e.code === "IntlRo")
      ) {
        e.preventDefault();
        openSettings("shortcuts");
        return;
      }

      // Cmd+= or Cmd++ - Zoom in (works everywhere, including settings)
      if ((e.metaKey || e.ctrlKey) && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        setInterfaceZoom((prev) => prev + 0.05);
        const newZoom = Math.round(Math.min(interfaceZoomRef.current + 0.05, 1.5) * 20) / 20;
        toast(`Zoom ${Math.round(newZoom * 100)}%`, { id: "zoom", duration: 1500 });
        return;
      }

      // Cmd+- - Zoom out (works everywhere, including settings)
      if ((e.metaKey || e.ctrlKey) && (e.key === "-" || e.key === "_")) {
        e.preventDefault();
        setInterfaceZoom((prev) => prev - 0.05);
        const newZoom = Math.round(Math.max(interfaceZoomRef.current - 0.05, 0.7) * 20) / 20;
        toast(`Zoom ${Math.round(newZoom * 100)}%`, { id: "zoom", duration: 1500 });
        return;
      }

      // Cmd+0 - Reset zoom (works everywhere, including settings)
      if ((e.metaKey || e.ctrlKey) && e.key === "0") {
        e.preventDefault();
        setInterfaceZoom(1.0);
        toast("Zoom 100%", { id: "zoom", duration: 1500 });
        return;
      }

      // Cmd/Ctrl+4 - Toggle outline panel
      if ((e.metaKey || e.ctrlKey) && e.key === "4") {
        e.preventDefault();
        toggleRightPanel();
        return;
      }

      // Block all other shortcuts when in settings view
      if (viewRef.current === "settings") {
        return;
      }

      // Cmd+Shift+Enter - Toggle focus mode
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "Enter") {
        e.preventDefault();
        toggleFocusMode();
        return;
      }

      // Cmd+Shift+M - Toggle markdown source mode
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "m"
      ) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("toggle-source-mode"));
        return;
      }

      // Escape exits focus mode when not in editor
      if (e.key === "Escape" && focusModeRef.current && !isInEditor) {
        e.preventDefault();
        toggleFocusMode();
        return;
      }

      // Let dialogs handle their own keyboard events (Tab, Enter, etc.)
      if (targetElement?.closest("[role='dialog'], [role='alertdialog']")) {
        return;
      }

      // Cmd+P - Open command palette
      if ((e.metaKey || e.ctrlKey) && e.key === "p") {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }

      // Cmd/Ctrl+Shift+F - Open sidebar search
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "f"
      ) {
        e.preventDefault();
        if (focusModeRef.current) {
          setFocusMode(false);
        }
        if (paneModeRef.current < 2) {
          setPaneMode(2);
        }
        requestAnimationFrame(() => {
          window.dispatchEvent(new CustomEvent("open-notes-search"));
        });
        return;
      }

      // Cmd+\ - Cycle pane layout
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        cyclePaneMode();
        return;
      }

      // Cmd+N - New note
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        createNote();
        return;
      }

      if (
        (e.metaKey || e.ctrlKey) &&
        e.key.toLowerCase() === "a" &&
        !isInEditor &&
        !isInInput &&
        isInNoteList
      ) {
        e.preventDefault();
        selectAllVisibleNotes();
        return;
      }

      // Delete current note (note list focused, or editor on empty note)
      if (
        (selectedNoteIdKbRef.current || selectedNoteIdsKbRef.current.length > 0) &&
        !isInInput &&
        (e.key === "Delete" ||
          (e.key === "Backspace" && (e.metaKey || e.ctrlKey))) &&
        ((!isInEditor && isInNoteList) || isEditorEmpty)
      ) {
        e.preventDefault();
        window.dispatchEvent(
          new CustomEvent("request-delete-note", {
            detail:
              selectedNoteIdsKbRef.current.length > 1
                ? selectedNoteIdsKbRef.current
                : selectedNoteIdKbRef.current ?? selectedNoteIdsKbRef.current[0],
          }),
        );
        return;
      }

      // Cmd+D - Duplicate current note
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key.toLowerCase() === "d" &&
        !isInEditor &&
        !isInInput &&
        selectedNoteIdKbRef.current
      ) {
        e.preventDefault();
        duplicateNote(selectedNoteIdKbRef.current);
        return;
      }

      // Cmd+R - Reload current note (pull external changes)
      if ((e.metaKey || e.ctrlKey) && e.key === "r") {
        e.preventDefault();
        reloadCurrentNote();
        return;
      }

      // Arrow keys for note navigation
      // Skip if folder tree view is handling its own navigation
      const isInFolderTree = !!targetElement?.closest("[data-folder-tree]");
      if (
        displayItemsRef.current.length > 0 &&
        (e.key === "ArrowDown" || e.key === "ArrowUp") &&
        ((!isInEditor && !isInInput) || isEditorEmpty) &&
        paneModeRef.current >= 2 &&
        !focusModeRef.current &&
        !isInFolderTree &&
        isInNoteList
      ) {
        e.preventDefault();
        const currentIndex = displayItemsRef.current.findIndex(
          (n) => n.id === selectedNoteIdKbRef.current,
        );

        // Selected note is no longer in the visible list (e.g. after a filter
        // change) — snap to the first item rather than doing arithmetic on -1.
        if (currentIndex === -1) {
          selectNote(displayItemsRef.current[0].id);
          window.dispatchEvent(new CustomEvent("focus-note-list"));
          return;
        }

        let newIndex: number;

        if (e.key === "ArrowDown") {
          newIndex =
            currentIndex < displayItemsRef.current.length - 1 ? currentIndex + 1 : 0;
        } else {
          newIndex =
            currentIndex > 0 ? currentIndex - 1 : displayItemsRef.current.length - 1;
        }

        if (e.shiftKey) {
          selectNoteRange(displayItemsRef.current[newIndex].id);
        } else {
          selectNote(displayItemsRef.current[newIndex].id);
        }
        window.dispatchEvent(new CustomEvent("focus-note-list"));
        return;
      }

      // Enter to focus editor
      if (e.key === "Enter" && selectedNoteIdKbRef.current && !isInEditor && !isInInput) {
        e.preventDefault();
        const editor = document.querySelector(".ProseMirror") as HTMLElement;
        if (editor) {
          editor.focus();
        }
        return;
      }

      // Escape to blur editor and go back to note list
      if (e.key === "Escape" && isInEditor) {
        e.preventDefault();
        if (targetElement instanceof HTMLElement) {
          targetElement.blur();
        }
        if (!focusModeRef.current && paneModeRef.current >= 2) {
          window.dispatchEvent(new CustomEvent("focus-note-list"));
        }
        return;
      }

      if (e.key === "Escape" && isInNoteList && selectedNoteIdsKbRef.current.length > 1) {
        e.preventDefault();
        clearNoteSelection();
        return;
      }
    };

    // Disable right-click context menu except in editor
    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Allow context menu in editor (prose class), inputs, and note list sidebar
      const isInEditor =
        target.closest(".prose") || target.closest(".ProseMirror");
      const isInput =
        target.tagName === "INPUT" || target.tagName === "TEXTAREA";
      const isInNoteList = target.closest("[data-note-list]");
      if (!isInEditor && !isInput && !isInNoteList) {
        e.preventDefault();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("contextmenu", handleContextMenu);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [
    createNote,
    cyclePaneMode,
    duplicateNote,
    reloadCurrentNote,
    selectNote,
    selectNoteRange,
    clearNoteSelection,
    selectAllVisibleNotes,
    setPaneMode,
    toggleRightPanel,
    openSettings,
    toggleFocusMode,
    setInterfaceZoom,
  ]);

  const handleClosePalette = useCallback(() => {
    setPaletteOpen(false);
    editorRef.current?.commands.focus();
  }, []);

  const handleEditorReady = useCallback((editor: TiptapEditor | null) => {
    editorRef.current = editor;
    setEditorInstance(editor);
  }, []);

  const workspaceEditorData = useMemo<WorkspaceEditorData>(
    () => ({
      currentNote,
      notesFolder,
      selectedNoteId,
      notes,
      hasExternalChanges,
      reloadVersion,
      saveNote,
      renameNote,
      reloadCurrentNote,
      createNote,
      consumePendingNewNote,
      pinNote,
      unpinNote,
      selectNote,
    }),
    [
      consumePendingNewNote,
      createNote,
      currentNote,
      hasExternalChanges,
      notes,
      notesFolder,
      pinNote,
      renameNote,
      reloadVersion,
      reloadCurrentNote,
      saveNote,
      selectNote,
      selectedNoteId,
      unpinNote,
    ],
  );

  const assistantProps = useMemo<RightPanelAssistantProps>(
    () => ({
      hasNote: Boolean(currentNote),
      providerCheckComplete: assistantProvidersLoaded,
      availableProviders: availableAssistantProviders,
      thread: currentAssistantThread,
      onProviderChange: handleAssistantProviderChange,
      onScopeChange: handleAssistantScopeChange,
      onDraftChange: handleAssistantDraftChange,
      onClearThread: handleClearAssistantThread,
      onSubmit: handleAssistantSubmit,
      onApplyProposal: handleApplyAssistantProposal,
    }),
    [
      assistantProvidersLoaded,
      availableAssistantProviders,
      currentAssistantThread,
      currentNote,
      handleApplyAssistantProposal,
      handleAssistantDraftChange,
      handleAssistantProviderChange,
      handleAssistantScopeChange,
      handleAssistantSubmit,
      handleClearAssistantThread,
    ],
  );

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-bg-secondary">
        <div className="text-text-muted/70 text-sm flex items-center gap-1.5 font-medium">
          <LoadingSpinner size="lg" className="text-current" />
          Initializing Sly...
        </div>
      </div>
    );
  }

  if (!notesFolder) {
    return <FolderPicker />;
  }

  return (
    <>
      <div className="relative h-screen flex bg-bg overflow-hidden">
        {view === "notes" && !focusMode && (
          <TitlebarPaneSwitch
            paneMode={paneMode}
            onCyclePaneMode={cyclePaneMode}
            rightPanelVisible={rightPanelVisible}
            onToggleRightPanel={toggleRightPanel}
            tasksEnabled={tasksEnabled}
            isTasksModeActive={isTasksModeActive}
            onShowNotes={showNotesMode}
            onShowTasks={showTasksMode}
            showRightPanelToggle={!isTasksModeActive}
          />
        )}
        {view === "settings" ? (
          <SettingsPage
            key={settingsKey}
            onBack={closeSettings}
            initialTab={settingsInitialTab}
            availableAiProviders={availableAssistantProviders}
            aiProvidersLoading={!assistantProvidersLoaded}
            onRefreshAiProviders={refreshAssistantProviders}
          />
        ) : (
          <WorkspaceMain
            paneMode={paneMode}
            workspaceMode={workspaceMode}
            focusMode={focusMode}
            showRightPanel={showRightPanel}
            rightPanelWidth={rightPanelWidth}
            rightPanelTab={rightPanelTab}
            editorInstance={editorInstance}
            editorScrollContainer={editorScrollContainer}
            currentNoteId={currentNote?.id ?? null}
            currentAssistantSelection={currentAssistantSelection}
            assistantProps={assistantProps}
            workspaceEditorData={workspaceEditorData}
            onOpenSettings={openSettings}
            onEditorSourceModeChange={setEditorSourceMode}
            onRegisterScrollContainer={setEditorScrollContainer}
            onRegisterFlushPendingSave={handleRegisterFlushPendingSave}
            onEditorReady={handleEditorReady}
            onRightPanelTabChange={setRightPanelTab}
            onRightPanelWidthChange={setRightPanelWidth}
          />
        )}
      </div>

      <Suspense fallback={null}>
        <CommandPalette
          open={paletteOpen}
          onClose={handleClosePalette}
          onOpenSettings={openSettings}
          focusMode={focusMode}
          onToggleFocusMode={toggleFocusMode}
          rightPanelVisible={rightPanelVisible}
          onToggleRightPanel={toggleRightPanel}
          editorRef={editorRef}
          flushPendingSave={flushPendingSave}
        />
      </Suspense>
    </>
  );
}

// Shared update check — used by startup and manual "Check for Updates"
async function showUpdateToast(): Promise<"update" | "no-update" | "error"> {
  try {
    const update = await checkForUpdate();
    if (update) {
      toast(<UpdateToast update={update} toastId="update-toast" />, {
        id: "update-toast",
        duration: Infinity,
        closeButton: true,
      });
      return "update";
    }
    return "no-update";
  } catch (err) {
    // Network errors and 404s (no release published yet) are not real failures
    const msg = String(err);
    if (
      msg.includes("404") ||
      msg.includes("network") ||
      msg.includes("Could not fetch")
    ) {
      return "no-update";
    }
    console.error("Update check failed:", err);
    return "error";
  }
}

export { showUpdateToast };

function App() {
  const route = useMemo(getWindowMode, []);
  const isDetachedMode = route.mode === "detached";
  const isPreviewMode =
    isDetachedMode &&
    route.source === "external-file" &&
    route.presentation === "interactive";
  const isPrintMode =
    isDetachedMode &&
    route.source === "external-file" &&
    route.presentation === "print";

  // Cmd/Ctrl+W — close window (works in both preview and folder mode)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "w") {
        e.preventDefault();
        getCurrentWindow().close().catch(console.error);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Add platform class for OS-specific styling (e.g., keyboard shortcuts)
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add(isMac ? "platform-mac" : "platform-other");
    if (isTauri()) {
      root.classList.add("platform-tauri");
    }
    root.classList.toggle("window-mode-preview", isPreviewMode);
    root.classList.toggle("window-mode-print", isPrintMode);

    return () => {
      root.classList.remove("window-mode-preview", "window-mode-print");
    };
  }, [isPreviewMode, isPrintMode]);

  // Check for app updates on startup (folder mode only)
  useEffect(() => {
    if (route.mode !== "folder") return;
    const timer = setTimeout(() => showUpdateToast(), 3000);
    return () => clearTimeout(timer);
  }, [route]);

  if (
    route.mode === "detached" &&
    route.source === "external-file" &&
    route.filePath
  ) {
    return (
      <ThemeProvider>
        <Toaster />
        <TooltipProvider>
          <Suspense fallback={<PreviewFallback />}>
            <PreviewApp
              filePath={decodeURIComponent(route.filePath)}
              presentation={route.presentation}
            />
          </Suspense>
        </TooltipProvider>
      </ThemeProvider>
    );
  }

  if (
    route.mode === "detached" &&
    route.source === "workspace-note" &&
    route.noteId
  ) {
    return (
      <ThemeProvider>
        <Toaster />
        <TooltipProvider>
          <NotesProvider>
            <Suspense fallback={<PreviewFallback />}>
              <WorkspaceNoteApp noteId={decodeURIComponent(route.noteId)} />
            </Suspense>
          </NotesProvider>
        </TooltipProvider>
      </ThemeProvider>
    );
  }

  // Folder mode: full app with sidebar, search, git, etc.
  return (
    <ThemeProvider>
      <Toaster />
      <TooltipProvider>
        <NotesProvider>
          <TasksProvider>
            <GitProvider>
              <AppContent />
            </GitProvider>
          </TasksProvider>
        </NotesProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}

export default App;

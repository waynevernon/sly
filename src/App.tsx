import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { PanelLeft } from "lucide-react";
import { toast } from "sonner";
import { NotesProvider, useNotes } from "./context/NotesContext";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { listen } from "@tauri-apps/api/event";
import { isTauri } from "@tauri-apps/api/core";
import { GitProvider } from "./context/GitContext";
import { IconButton, TooltipProvider, Toaster } from "./components/ui";
import { WorkspaceNavigation } from "./components/layout/WorkspaceNavigation";
import { Editor } from "./components/editor/Editor";
import type { Editor as TiptapEditor } from "@tiptap/react";
import { FolderPicker } from "./components/layout/FolderPicker";
import { CommandPalette } from "./components/command-palette/CommandPalette";
import { SettingsPage } from "./components/settings";
import type { PaneMode } from "./types/note";
import type { SettingsTab } from "./components/settings/SettingsPage";
import {
  SpinnerIcon,
  ClaudeIcon,
  CodexIcon,
  OpenCodeIcon,
  OllamaIcon,
} from "./components/icons";
import { AiEditModal } from "./components/ai/AiEditModal";
import { AiResponseToast } from "./components/ai/AiResponseToast";
import { PreviewApp } from "./components/preview/PreviewApp";
import {
  check as checkForUpdate,
} from "@tauri-apps/plugin-updater";
import { getCurrentWindow } from "@tauri-apps/api/window";
import * as aiService from "./services/ai";
import type { AiProvider } from "./services/ai";
import { isMac, mod } from "./lib/platform";
import { UpdateToast } from "./components/updater/UpdateToast";

// Detect preview mode from URL search params
function getWindowMode(): {
  isPreview: boolean;
  previewFile: string | null;
} {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode");
  const file = params.get("file");
  return {
    isPreview: mode === "preview" && !!file,
    previewFile: file,
  };
}

type ViewState = "notes" | "settings";

function formatPaneModeLabel(mode: PaneMode): string {
  if (mode === 1) return "1 Pane";
  if (mode === 2) return "2 Panes";
  return "3 Panes";
}

function getNextPaneMode(mode: PaneMode): PaneMode {
  return mode === 1 ? 3 : ((mode - 1) as PaneMode);
}

function TitlebarPaneSwitch({
  paneMode,
  onCyclePaneMode,
}: {
  paneMode: PaneMode;
  onCyclePaneMode: () => void;
}) {
  return (
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
  );
}

function AppContent() {
  const {
    notesFolder,
    isLoading,
    createNote,
    duplicateNote,
    scopedNotes,
    selectedNoteId,
    selectedNoteIds,
    selectNote,
    selectNoteRange,
    clearNoteSelection,
    selectAllVisibleNotes,
    searchQuery,
    searchResults,
    reloadCurrentNote,
    currentNote,
    syncNotesFolder,
  } = useNotes();
  const {
    interfaceZoom,
    setInterfaceZoom,
    paneMode,
    setPaneMode,
    cyclePaneMode,
  } = useTheme();
  const interfaceZoomRef = useRef(interfaceZoom);
  interfaceZoomRef.current = interfaceZoom;
  const paneModeRef = useRef(paneMode);
  paneModeRef.current = paneMode;
  const currentNoteRef = useRef(currentNote);
  currentNoteRef.current = currentNote;
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [view, setView] = useState<ViewState>("notes");
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiEditing, setAiEditing] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [aiProvider, setAiProvider] = useState<AiProvider>("claude");
  const editorRef = useRef<TiptapEditor | null>(null);

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

  const toggleFocusMode = useCallback(() => {
    setFocusMode((prev) => {
      // Don't enter focus mode without a selected note
      if (!prev && !selectedNoteId) return prev;
      return !prev;
    });
  }, [selectedNoteId]);

  const [settingsInitialTab, setSettingsInitialTab] = useState<
    SettingsTab | undefined
  >(undefined);
  const [settingsKey, setSettingsKey] = useState(0);

  const openSettings = useCallback(
    (tab?: "general" | "editor" | "shortcuts" | "about") => {
      const validTab = typeof tab === "string" ? tab : undefined;
      setPaletteOpen(false);
      setAiModalOpen(false);
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

  const applyPaneModeSelection = useCallback(
    (mode: PaneMode) => {
      setFocusMode(false);
      setPaneMode(mode);
    },
    [setPaneMode],
  );

  useEffect(() => {
    let cancelled = false;
    let unlistenOpenSettings: (() => void) | undefined;
    let unlistenOpenSettingsAbout: (() => void) | undefined;
    let unlistenSetPaneMode: (() => void) | undefined;
    let unlistenToggleFocusMode: (() => void) | undefined;

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

    return () => {
      cancelled = true;
      unlistenOpenSettings?.();
      unlistenOpenSettingsAbout?.();
      unlistenSetPaneMode?.();
      unlistenToggleFocusMode?.();
    };
  }, [applyPaneModeSelection, openSettings, toggleFocusMode]);

  // Go back to command palette from AI modal
  const handleBackToPalette = useCallback(() => {
    setAiModalOpen(false);
    setPaletteOpen(true);
  }, []);

  // AI Edit handler
  const handleAiEdit = useCallback(
    async (prompt: string, ollamaModel?: string) => {
      if (!currentNote) {
        toast.error("No note selected");
        return;
      }

      setAiEditing(true);

      try {
        let result: aiService.AiExecutionResult;
        if (aiProvider === "codex") {
          result = await aiService.executeCodexEdit(currentNote.path, prompt);
        } else if (aiProvider === "opencode") {
          result = await aiService.executeOpenCodeEdit(currentNote.path, prompt);
        } else if (aiProvider === "ollama") {
          result = await aiService.executeOllamaEdit(
            currentNote.path,
            prompt,
            ollamaModel || "qwen3:8b",
          );
        } else {
          result = await aiService.executeClaudeEdit(currentNote.path, prompt);
        }

        // Reload the current note from disk
        await reloadCurrentNote();

        // Show results
        if (result.success) {
          // Close modal after success
          setAiModalOpen(false);

          // Show success toast with provider response
          toast(
            <AiResponseToast output={result.output} provider={aiProvider} />,
            {
              duration: Infinity,
              closeButton: true,
              className: "!min-w-[450px] !max-w-[600px]",
            },
          );
        } else {
          toast.error(
            <div className="space-y-1">
              <div className="font-medium">AI Edit Failed</div>
              <div className="text-xs">{result.error || "Unknown error"}</div>
            </div>,
            { duration: Infinity, closeButton: true },
          );
        }
      } catch (error) {
        console.error("[AI] Error:", error);
        toast.error(
          `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      } finally {
        setAiEditing(false);
      }
    },
    [aiProvider, currentNote, reloadCurrentNote],
  );

  // Memoize display items to prevent unnecessary recalculations
  const displayItems = useMemo(() => {
    return searchQuery.trim() ? searchResults : scopedNotes;
  }, [scopedNotes, searchQuery, searchResults]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInEditor = !!target.closest(".ProseMirror");
      const isInInput =
        target.tagName === "INPUT" || target.tagName === "TEXTAREA";
      const isInNoteList =
        !!target.closest("[data-note-list]") ||
        !!document.activeElement?.closest("[data-note-list]");
      const isEditorEmpty =
        isInEditor && currentNoteRef.current?.content.trim() === "";

      // Cmd+, - Open settings (always works, even in settings)
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        openSettings();
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

      // Block all other shortcuts when in settings view
      if (view === "settings") {
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
      if (e.key === "Escape" && focusMode && !isInEditor) {
        e.preventDefault();
        toggleFocusMode();
        return;
      }

      // Let dialogs handle their own keyboard events (Tab, Enter, etc.)
      if (target.closest("[role='dialog'], [role='alertdialog']")) {
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
        if (focusMode) {
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
        (selectedNoteId || selectedNoteIds.length > 0) &&
        !isInInput &&
        (e.key === "Delete" ||
          (e.key === "Backspace" && (e.metaKey || e.ctrlKey))) &&
        ((!isInEditor && isInNoteList) || isEditorEmpty)
      ) {
        e.preventDefault();
        window.dispatchEvent(
          new CustomEvent("request-delete-note", {
            detail:
              selectedNoteIds.length > 1
                ? selectedNoteIds
                : selectedNoteId ?? selectedNoteIds[0],
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
        selectedNoteId
      ) {
        e.preventDefault();
        duplicateNote(selectedNoteId);
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
      const isInFolderTree = !!(e.target as HTMLElement).closest("[data-folder-tree]");
      if (
        displayItems.length > 0 &&
        (e.key === "ArrowDown" || e.key === "ArrowUp") &&
        ((!isInEditor && !isInInput) || isEditorEmpty) &&
        paneModeRef.current >= 2 &&
        !focusMode &&
        !isInFolderTree &&
        isInNoteList
      ) {
        e.preventDefault();
        const currentIndex = displayItems.findIndex(
          (n) => n.id === selectedNoteId,
        );
        let newIndex: number;

        if (e.key === "ArrowDown") {
          newIndex =
            currentIndex < displayItems.length - 1 ? currentIndex + 1 : 0;
        } else {
          newIndex =
            currentIndex > 0 ? currentIndex - 1 : displayItems.length - 1;
        }

        if (e.shiftKey) {
          selectNoteRange(displayItems[newIndex].id);
        } else {
          selectNote(displayItems[newIndex].id);
        }
        window.dispatchEvent(new CustomEvent("focus-note-list"));
        return;
      }

      // Enter to focus editor
      if (e.key === "Enter" && selectedNoteId && !isInEditor && !isInInput) {
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
        (target as HTMLElement).blur();
        if (!focusMode && paneModeRef.current >= 2) {
          window.dispatchEvent(new CustomEvent("focus-note-list"));
        }
        return;
      }

      if (e.key === "Escape" && isInNoteList && selectedNoteIds.length > 1) {
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
    displayItems,
    paneMode,
    reloadCurrentNote,
    selectedNoteId,
    selectedNoteIds,
    selectNote,
    selectNoteRange,
    clearNoteSelection,
    selectAllVisibleNotes,
    setPaneMode,
    openSettings,
    toggleFocusMode,
    focusMode,
    view,
    setInterfaceZoom,
  ]);

  const handleClosePalette = useCallback(() => {
    setPaletteOpen(false);
  }, []);

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-bg-secondary">
        <div className="text-text-muted/70 text-sm flex items-center gap-1.5 font-medium">
          <SpinnerIcon className="w-4.5 h-4.5 stroke-[1.5] animate-spin" />
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
          />
        )}
        {view === "settings" ? (
          <SettingsPage key={settingsKey} onBack={closeSettings} initialTab={settingsInitialTab} />
        ) : (
          <>
            <WorkspaceNavigation
              paneMode={focusMode ? 1 : paneMode}
              onOpenSettings={openSettings}
            />
            <Editor
              paneMode={paneMode}
              focusMode={focusMode}
              onEditorReady={(editor) => {
                editorRef.current = editor;
              }}
            />
          </>
        )}
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={handleClosePalette}
        onOpenSettings={openSettings}
        onOpenAiModal={(provider) => {
          setAiProvider(provider);
          setAiModalOpen(true);
        }}
        focusMode={focusMode}
        onToggleFocusMode={toggleFocusMode}
        editorRef={editorRef}
      />
      <AiEditModal
        open={aiModalOpen}
        provider={aiProvider}
        onBack={handleBackToPalette}
        onExecute={handleAiEdit}
        isExecuting={aiEditing}
      />

      {/* AI Editing Overlay */}
      {aiEditing && (
        <div className="fixed inset-0 bg-bg/50 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="flex items-center gap-2">
            {aiProvider === "codex" ? (
              <CodexIcon className="w-4.5 h-4.5 fill-text-muted animate-spin-slow" />
            ) : aiProvider === "opencode" ? (
              <OpenCodeIcon className="w-4.5 h-4.5 fill-text-muted animate-pulse-gentle" />
            ) : aiProvider === "ollama" ? (
              <OllamaIcon className="w-4.5 h-4.5 fill-text-muted animate-bounce-gentle" />
            ) : (
              <ClaudeIcon className="w-4.5 h-4.5 fill-text-muted animate-spin-slow" />
            )}
            <div className="text-sm font-medium text-text">
              {aiProvider === "codex"
                ? "Codex is editing your note..."
                : aiProvider === "opencode"
                  ? "OpenCode is editing your note..."
                : aiProvider === "ollama"
                  ? "Ollama is editing your note..."
                  : "Claude is editing your note..."}
            </div>
          </div>
        </div>
      )}
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
  const { isPreview, previewFile } = useMemo(getWindowMode, []);

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
      if (import.meta.env.PROD) {
        root.classList.add("platform-tauri-release");
      }
    }
  }, []);

  // Check for app updates on startup (folder mode only)
  useEffect(() => {
    if (isPreview) return;
    const timer = setTimeout(() => showUpdateToast(), 3000);
    return () => clearTimeout(timer);
  }, [isPreview]);

  // Preview mode: lightweight editor without sidebar, search, git
  if (isPreview && previewFile) {
    return (
      <ThemeProvider>
        <Toaster />
        <TooltipProvider>
          <PreviewApp filePath={decodeURIComponent(previewFile)} />
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
          <GitProvider>
            <AppContent />
          </GitProvider>
        </NotesProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}

export default App;

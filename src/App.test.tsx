import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, type PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const { tauriEventListeners, listenMock } = vi.hoisted(() => {
  const listeners = new Map<string, Set<(event: { payload: unknown }) => void>>();
  return {
    tauriEventListeners: listeners,
    listenMock: vi.fn(
      (event: string, callback: (event: { payload: unknown }) => void) => {
        const callbacks = listeners.get(event) ?? new Set();
        callbacks.add(callback);
        listeners.set(event, callbacks);

        return Promise.resolve(() => {
          callbacks.delete(callback);
          if (callbacks.size === 0) {
            listeners.delete(event);
          }
        });
      },
    ),
  };
});

function emitTauriEvent(event: string, payload?: unknown) {
  for (const callback of tauriEventListeners.get(event) ?? []) {
    callback({ payload });
  }
}

const notesDataState = {
  notesFolder: "/notes",
  isLoading: false,
  notes: [],
  scopedNotes: [],
  selectedNoteId: "alpha",
  selectedNoteIds: ["alpha"],
  currentNote: {
    id: "alpha",
    title: "Alpha",
    content: "# Alpha",
    path: "/notes/alpha.md",
    modified: 1,
  },
  settings: { ollamaModel: "qwen3:8b", tasksEnabled: false },
  searchQuery: "",
  searchResults: [],
  hasExternalChanges: false,
  reloadVersion: 0,
};

const notesActionsState = {
  createNote: vi.fn(),
  duplicateNote: vi.fn(),
  selectNote: vi.fn(),
  selectNoteRange: vi.fn(),
  clearNoteSelection: vi.fn(),
  selectAllVisibleNotes: vi.fn(),
  reloadCurrentNote: vi.fn(),
  saveNote: vi.fn(),
  renameNote: vi.fn(),
  syncNotesFolder: vi.fn(),
  consumePendingNewNote: vi.fn(() => false),
  pinNote: vi.fn(),
  unpinNote: vi.fn(),
};

const themeState = {
  interfaceZoom: 1,
  setInterfaceZoom: vi.fn(),
  paneMode: 3 as 1 | 2 | 3,
  setPaneMode: vi.fn(),
  cyclePaneMode: vi.fn(),
  rightPanelVisible: true,
  rightPanelWidth: 260,
  rightPanelTab: "outline" as "outline" | "assistant",
  setRightPanelVisible: vi.fn(),
  setRightPanelWidth: vi.fn(),
  setRightPanelTab: vi.fn(),
};

const tasksState = {
  deleteTask: vi.fn().mockResolvedValue(undefined),
  selectAllVisibleTasks: vi.fn(),
  selectedTaskId: "task-1",
  selectedTaskIds: ["task-1", "task-2"],
};

vi.mock("@tauri-apps/api/event", () => ({
  listen: listenMock,
}));

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => false,
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    close: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: vi.fn().mockResolvedValue(null),
}));

vi.mock("./context/NotesContext", () => ({
  NotesProvider: ({ children }: PropsWithChildren) => children,
  useNotesData: () => notesDataState,
  useNotesActions: () => notesActionsState,
}));

vi.mock("./context/ThemeContext", () => ({
  ThemeProvider: ({ children }: PropsWithChildren) => children,
  useTheme: () => themeState,
}));

vi.mock("./context/GitContext", () => ({
  GitProvider: ({ children }: PropsWithChildren) => children,
}));

vi.mock("./context/TasksContext", () => ({
  TasksProvider: ({ children }: PropsWithChildren) => children,
  useTasks: () => tasksState,
}));

const editorListeners = {
  selectionUpdate: new Set<() => void>(),
};

const fakeEditor = {
  isFocused: true,
  state: {
    selection: { from: 1, to: 6, empty: false },
    doc: {
      textBetween: vi.fn(() => "Alpha"),
    },
  },
  on: vi.fn((event: "selectionUpdate", callback: () => void) => {
    editorListeners[event].add(callback);
  }),
  off: vi.fn((event: "selectionUpdate", callback: () => void) => {
    editorListeners[event].delete(callback);
  }),
};

vi.mock("./components/layout/WorkspaceNavigation", () => ({
  WorkspaceNavigation: ({
    onOpenSettings,
    workspaceMode,
    onShowNotes,
    onShowTasks,
  }: {
    onOpenSettings: (tab?: string) => void;
    workspaceMode: "notes" | "tasks";
    onShowNotes?: () => void;
    onShowTasks?: () => void;
  }) => (
    <div>
      <div>workspace-navigation:{workspaceMode}</div>
      <button onClick={() => onOpenSettings()}>open settings</button>
      {onShowNotes && <button onClick={onShowNotes}>Notes</button>}
      {onShowTasks && <button onClick={onShowTasks}>Tasks</button>}
      {workspaceMode === "tasks" ? (
        <div data-task-list>
          <button>task-list-focus</button>
        </div>
      ) : null}
    </div>
  ),
}));

vi.mock("./components/layout/RightPanel", () => ({
  RightPanel: ({ visible }: { visible: boolean }) =>
    visible ? <div>right-panel</div> : null,
}));

vi.mock("./components/editor/Editor", () => ({
  Editor: ({
    onRegisterFlushPendingSave,
    onEditorReady,
  }: {
    onRegisterFlushPendingSave?: ((flushPendingSave: (() => Promise<void>) | null) => void) | null;
    onEditorReady?: ((editor: typeof fakeEditor | null) => void) | null;
  }) => {
    useEffect(() => {
      onRegisterFlushPendingSave?.(async () => {});
      onEditorReady?.(fakeEditor);
      return () => onRegisterFlushPendingSave?.(null);
    }, [onEditorReady, onRegisterFlushPendingSave]);

    return <div>editor</div>;
  },
}));

vi.mock("./components/tasks/TaskDetailPanel", () => ({
  TaskDetailPanel: () => (
    <div data-task-detail-panel>
      <div>task-detail-panel</div>
      <button>task-detail-focus</button>
    </div>
  ),
}));

vi.mock("./components/layout/FolderPicker", () => ({
  FolderPicker: () => <div>folder-picker</div>,
}));

vi.mock("./components/settings", () => ({
  SettingsPage: ({
    onBack,
    initialTab,
  }: {
    onBack: () => void;
    initialTab?: string;
  }) => (
    <div>
      <div>settings-page</div>
      <div>settings-tab:{initialTab ?? "notes"}</div>
      <button onClick={onBack}>back</button>
    </div>
  ),
}));

vi.mock("./components/command-palette/CommandPalette", () => ({
  CommandPalette: ({
    open,
    flushPendingSave,
  }: {
    open: boolean;
    flushPendingSave?: (() => Promise<void>) | null;
  }) => (
    <>
      <div data-testid="flush-pending-save-type">
        {typeof flushPendingSave}
      </div>
      {open ? <div>command-palette</div> : null}
    </>
  ),
}));

vi.mock("./components/tasks/GlobalTaskCaptureDialog", () => ({
  GlobalTaskCaptureDialog: ({ open }: { open: boolean }) =>
    open ? <div>global-task-capture-dialog</div> : null,
}));

vi.mock("./components/preview/PreviewApp", () => ({
  PreviewApp: ({
    filePath,
    presentation,
  }: {
    filePath: string;
    presentation?: "interactive" | "print";
  }) => (
    <div>
      preview-app:{presentation ?? "interactive"}:{filePath}
    </div>
  ),
}));

vi.mock("./components/preview/WorkspaceNoteApp", () => ({
  WorkspaceNoteApp: ({ noteId }: { noteId: string }) => (
    <div>workspace-note-app:{noteId}</div>
  ),
}));

describe("App", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    vi.clearAllMocks();
    editorListeners.selectionUpdate.clear();
    fakeEditor.state.selection = { from: 1, to: 6, empty: false };
    fakeEditor.state.doc.textBetween = vi.fn(() => "Alpha");
    notesDataState.currentNote = {
      id: "alpha",
      title: "Alpha",
      content: "# Alpha",
      path: "/notes/alpha.md",
      modified: 1,
    };
    themeState.paneMode = 3;
    themeState.rightPanelVisible = true;
    themeState.rightPanelTab = "outline";
    notesDataState.settings.tasksEnabled = false;
    tasksState.selectedTaskId = "task-1";
    tasksState.selectedTaskIds = ["task-1", "task-2"];
    tauriEventListeners.clear();
  });

  afterEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it("renders folder mode shell and opens settings after lazy load", async () => {
    render(<App />);

    expect(screen.getByText("workspace-navigation:notes")).toBeInTheDocument();
    expect(screen.getByText("editor")).toBeInTheDocument();
    expect(screen.getByText("right-panel")).toBeInTheDocument();
    expect(screen.queryByText("settings-page")).not.toBeInTheDocument();
    expect(screen.queryByText(/preview-app:/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("open settings"));

    expect(await screen.findByText("settings-page")).toBeInTheDocument();
  });

  it("only attaches assistant selection listeners while the assistant tab is active", async () => {
    const { rerender } = render(<App />);

    await waitFor(() => {
      expect(fakeEditor.on).not.toHaveBeenCalledWith(
        "selectionUpdate",
        expect.any(Function),
      );
    });

    themeState.rightPanelTab = "assistant";
    rerender(<App />);

    await waitFor(() => {
      expect(fakeEditor.on.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(editorListeners.selectionUpdate.size).toBe(2);
    });

    themeState.rightPanelTab = "outline";
    rerender(<App />);

    await waitFor(() => {
      expect(editorListeners.selectionUpdate.size).toBe(0);
    });
  });

  it("renders preview mode without folder mode shell", async () => {
    window.history.replaceState(
      {},
      "",
      "/?mode=preview&file=%2Ftmp%2Fpreview-note.md",
    );

    render(<App />);

    expect(
      await screen.findByText("preview-app:interactive:/tmp/preview-note.md"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/workspace-navigation:/)).not.toBeInTheDocument();
    expect(screen.queryByText("editor")).not.toBeInTheDocument();
    expect(screen.queryByText("folder-picker")).not.toBeInTheDocument();
  });

  it("opens the global task capture dialog with Cmd/Ctrl+Shift+N when tasks are enabled", async () => {
    notesDataState.settings.tasksEnabled = true;

    render(<App />);

    fireEvent.keyDown(window, { key: "N", ctrlKey: true, shiftKey: true });

    expect(await screen.findByText("global-task-capture-dialog")).toBeInTheDocument();
  });

  it("opens the global task capture dialog from the desktop shortcut event", async () => {
    notesDataState.settings.tasksEnabled = true;

    render(<App />);

    emitTauriEvent("open-global-task-capture");

    expect(await screen.findByText("global-task-capture-dialog")).toBeInTheDocument();
  });

  it("switches back to notes mode before creating a note with Cmd/Ctrl+N", async () => {
    notesDataState.settings.tasksEnabled = true;

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Tasks" }));
    expect(screen.getByText("workspace-navigation:tasks")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "n", metaKey: true });

    await waitFor(() => {
      expect(notesActionsState.createNote).toHaveBeenCalled();
      expect(screen.getByText("workspace-navigation:notes")).toBeInTheDocument();
    });
    expect(screen.getByText("editor")).toBeInTheDocument();
  });

  it("switches to task mode with Cmd/Ctrl+2 when tasks are enabled", async () => {
    notesDataState.settings.tasksEnabled = true;

    render(<App />);

    fireEvent.keyDown(window, { key: "2", metaKey: true });

    await waitFor(() => {
      expect(screen.getByText("workspace-navigation:tasks")).toBeInTheDocument();
    });
  });

  it("switches back to notes mode with Cmd/Ctrl+1", async () => {
    notesDataState.settings.tasksEnabled = true;

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Tasks" }));
    expect(screen.getByText("workspace-navigation:tasks")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "1", metaKey: true });

    await waitFor(() => {
      expect(screen.getByText("workspace-navigation:notes")).toBeInTheDocument();
    });
  });

  it("switches to a 2-pane layout with Cmd/Ctrl+Shift+K", () => {
    render(<App />);

    fireEvent.keyDown(window, { key: "k", metaKey: true, shiftKey: true });

    expect(themeState.setPaneMode).toHaveBeenCalledWith(2);
  });

  it("maps Cmd/Ctrl+Shift+J to 2-pane layout while in task mode", () => {
    notesDataState.settings.tasksEnabled = true;

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Tasks" }));
    expect(screen.getByText("workspace-navigation:tasks")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "j", metaKey: true, shiftKey: true });

    expect(themeState.setPaneMode).toHaveBeenCalledWith(2);
  });

  it("renders print mode without folder mode shell", async () => {
    window.history.replaceState(
      {},
      "",
      "/?mode=print&file=%2Ftmp%2Fprint-note.md",
    );

    render(<App />);

    expect(
      await screen.findByText("preview-app:print:/tmp/print-note.md"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/workspace-navigation:/)).not.toBeInTheDocument();
    expect(screen.queryByText("editor")).not.toBeInTheDocument();
    expect(screen.queryByText("folder-picker")).not.toBeInTheDocument();
  });

  it("renders detached workspace-note mode without folder mode shell", async () => {
    window.history.replaceState(
      {},
      "",
      "/?mode=detached&source=workspace-note&presentation=interactive&note=docs%2Falpha",
    );

    render(<App />);

    expect(
      await screen.findByText("workspace-note-app:docs/alpha"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/workspace-navigation:/)).not.toBeInTheDocument();
    expect(screen.queryByText("editor")).not.toBeInTheDocument();
    expect(screen.queryByText("folder-picker")).not.toBeInTheDocument();
  });

  it("keeps the right panel visible in 1-pane layout when enabled", () => {
    themeState.paneMode = 1;

    render(<App />);

    expect(screen.getByText("editor")).toBeInTheDocument();
    expect(screen.getByText("right-panel")).toBeInTheDocument();
  });

  it("uses the task detail workspace and hides the right panel in task mode", () => {
    notesDataState.settings.tasksEnabled = true;

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Tasks" }));

    expect(screen.getByText("workspace-navigation:tasks")).toBeInTheDocument();
    expect(screen.getByText("task-detail-panel")).toBeInTheDocument();
    expect(screen.queryByText("editor")).not.toBeInTheDocument();
    expect(screen.queryByText("right-panel")).not.toBeInTheDocument();
  });

  it("shows a Notes/Tasks toggle in the top chrome when tasks are enabled", () => {
    notesDataState.settings.tasksEnabled = true;

    render(<App />);

    expect(screen.getByRole("button", { name: "Notes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tasks" })).toBeInTheDocument();
  });

  it("switches between notes and tasks from the top chrome toggle", () => {
    notesDataState.settings.tasksEnabled = true;

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Tasks" }));

    expect(screen.getByText("workspace-navigation:tasks")).toBeInTheDocument();
    expect(screen.getByText("task-detail-panel")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Notes" }));

    expect(screen.getByText("workspace-navigation:notes")).toBeInTheDocument();
    expect(screen.getByText("editor")).toBeInTheDocument();
  });

  it("deletes selected tasks with Cmd/Ctrl+Delete from the task list", async () => {
    notesDataState.settings.tasksEnabled = true;

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Tasks" }));

    const focusTarget = screen.getByRole("button", { name: "task-list-focus" });
    focusTarget.focus();
    fireEvent.keyDown(focusTarget, { key: "Backspace", metaKey: true });

    await waitFor(() => {
      expect(tasksState.deleteTask).toHaveBeenCalledTimes(2);
    });
    expect(tasksState.deleteTask).toHaveBeenNthCalledWith(1, "task-1");
    expect(tasksState.deleteTask).toHaveBeenNthCalledWith(2, "task-2");
  });

  it("toggles the right pane with Cmd/Ctrl+Alt+4", () => {
    render(<App />);

    fireEvent.keyDown(window, { key: "4", metaKey: true, altKey: true });

    expect(themeState.setRightPanelVisible).toHaveBeenCalledWith(false);
  });

  it("does not toggle the right pane with Cmd/Ctrl+Alt+4 in task mode", () => {
    notesDataState.settings.tasksEnabled = true;

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Tasks" }));

    fireEvent.keyDown(window, { key: "4", metaKey: true, altKey: true });

    expect(themeState.setRightPanelVisible).not.toHaveBeenCalled();
  });

  it("reopens the task left nav from the pane button when task mode is active", () => {
    notesDataState.settings.tasksEnabled = true;
    themeState.paneMode = 2;

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Tasks" }));
    fireEvent.click(
      screen.getByRole("button", {
        name: /Workspace layout: 2 Panes\. Next: 3 Panes/,
      }),
    );

    expect(themeState.setPaneMode).toHaveBeenCalledWith(3);
  });

  it("reopens the task left nav from the keyboard pane shortcut in task mode", () => {
    notesDataState.settings.tasksEnabled = true;
    themeState.paneMode = 2;

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Tasks" }));
    fireEvent.keyDown(window, { key: "\\", metaKey: true });

    expect(themeState.setPaneMode).toHaveBeenCalledWith(3);
  });

  it("stores the registered flush callback as a function", () => {
    render(<App />);

    expect(screen.getByTestId("flush-pending-save-type")).toHaveTextContent(
      "function",
    );
  });

  it("opens the shortcuts settings tab with Cmd/Ctrl+?", async () => {
    render(<App />);

    fireEvent.keyDown(window, {
      key: "/",
      code: "Slash",
      metaKey: true,
    });

    expect(await screen.findByText("settings-page")).toBeInTheDocument();
    expect(screen.getByText("settings-tab:shortcuts")).toBeInTheDocument();
  });
});

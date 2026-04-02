import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, type PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

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
  settings: { ollamaModel: "qwen3:8b" },
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

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
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
  }: {
    onOpenSettings: (tab?: "general" | "editor" | "shortcuts" | "about") => void;
  }) => (
    <div>
      <div>workspace-navigation</div>
      <button onClick={() => onOpenSettings()}>open settings</button>
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

vi.mock("./components/layout/FolderPicker", () => ({
  FolderPicker: () => <div>folder-picker</div>,
}));

vi.mock("./components/settings", () => ({
  SettingsPage: ({ onBack }: { onBack: () => void }) => (
    <div>
      <div>settings-page</div>
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
  });

  afterEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it("renders folder mode shell and opens settings after lazy load", async () => {
    render(<App />);

    expect(screen.getByText("workspace-navigation")).toBeInTheDocument();
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
    expect(screen.queryByText("workspace-navigation")).not.toBeInTheDocument();
    expect(screen.queryByText("editor")).not.toBeInTheDocument();
    expect(screen.queryByText("folder-picker")).not.toBeInTheDocument();
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
    expect(screen.queryByText("workspace-navigation")).not.toBeInTheDocument();
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
    expect(screen.queryByText("workspace-navigation")).not.toBeInTheDocument();
    expect(screen.queryByText("editor")).not.toBeInTheDocument();
    expect(screen.queryByText("folder-picker")).not.toBeInTheDocument();
  });

  it("keeps the right panel visible in 1-pane layout when enabled", () => {
    themeState.paneMode = 1;

    render(<App />);

    expect(screen.getByText("editor")).toBeInTheDocument();
    expect(screen.getByText("right-panel")).toBeInTheDocument();
  });

  it("toggles the right panel with Cmd/Ctrl+4", () => {
    render(<App />);

    fireEvent.keyDown(window, { key: "4", metaKey: true });

    expect(themeState.setRightPanelVisible).toHaveBeenCalledWith(false);
  });

  it("stores the registered flush callback as a function", () => {
    render(<App />);

    expect(screen.getByTestId("flush-pending-save-type")).toHaveTextContent(
      "function",
    );
  });
});

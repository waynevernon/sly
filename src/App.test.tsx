import { fireEvent, render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const notesState = {
  notesFolder: "/notes",
  isLoading: false,
  createNote: vi.fn(),
  duplicateNote: vi.fn(),
  scopedNotes: [],
  selectedNoteId: "alpha",
  selectedNoteIds: ["alpha"],
  selectNote: vi.fn(),
  selectNoteRange: vi.fn(),
  clearNoteSelection: vi.fn(),
  selectAllVisibleNotes: vi.fn(),
  searchQuery: "",
  searchResults: [],
  reloadCurrentNote: vi.fn(),
  currentNote: null,
  syncNotesFolder: vi.fn(),
};

const themeState = {
  interfaceZoom: 1,
  setInterfaceZoom: vi.fn(),
  paneMode: 3 as 1 | 2 | 3,
  setPaneMode: vi.fn(),
  cyclePaneMode: vi.fn(),
  rightPanelVisible: true,
  rightPanelWidth: 260,
  setRightPanelVisible: vi.fn(),
  setRightPanelWidth: vi.fn(),
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
  useNotes: () => notesState,
}));

vi.mock("./context/ThemeContext", () => ({
  ThemeProvider: ({ children }: PropsWithChildren) => children,
  useTheme: () => themeState,
}));

vi.mock("./context/GitContext", () => ({
  GitProvider: ({ children }: PropsWithChildren) => children,
}));

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
  Editor: () => <div>editor</div>,
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
  CommandPalette: ({ open }: { open: boolean }) =>
    open ? <div>command-palette</div> : null,
}));

vi.mock("./components/ai/AiEditModal", () => ({
  AiEditModal: ({ open }: { open: boolean }) =>
    open ? <div>ai-edit-modal</div> : null,
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
    themeState.paneMode = 3;
    themeState.rightPanelVisible = true;
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
});

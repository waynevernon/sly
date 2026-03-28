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
  paneMode: 3 as const,
  setPaneMode: vi.fn(),
  cyclePaneMode: vi.fn(),
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
  PreviewApp: ({ filePath }: { filePath: string }) => (
    <div>preview-app:{filePath}</div>
  ),
}));

describe("App", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    vi.clearAllMocks();
  });

  afterEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it("renders folder mode shell and opens settings after lazy load", async () => {
    render(<App />);

    expect(screen.getByText("workspace-navigation")).toBeInTheDocument();
    expect(screen.getByText("editor")).toBeInTheDocument();
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
      await screen.findByText("preview-app:/tmp/preview-note.md"),
    ).toBeInTheDocument();
    expect(screen.queryByText("workspace-navigation")).not.toBeInTheDocument();
    expect(screen.queryByText("editor")).not.toBeInTheDocument();
    expect(screen.queryByText("folder-picker")).not.toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NoteList, type NoteListItem } from "./NoteList";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@dnd-kit/core", () => ({
  useDraggable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    isDragging: false,
  }),
}));

vi.mock("../../context/NotesContext", () => ({
  useNotes: vi.fn(),
}));

vi.mock("../../context/ThemeContext", () => ({
  useTheme: vi.fn(),
}));

type NotesHookValue = ReturnType<
  typeof import("../../context/NotesContext").useNotes
>;

const baseItem: NoteListItem = {
  id: "work/alpha",
  title: "Alpha note",
  preview: "planning",
  modified: Math.floor(new Date("2026-03-23T12:00:00Z").getTime() / 1000),
  created: Math.floor(new Date("2026-03-25T12:00:00Z").getTime() / 1000),
};

function makeNotesHookValue(
  overrides: Partial<NotesHookValue> = {},
): NotesHookValue {
  return {
    selectedNoteId: null,
    selectedNoteIds: [],
    selectNote: vi.fn(),
    toggleNoteSelection: vi.fn(),
    selectNoteRange: vi.fn(),
    clearNoteSelection: vi.fn(),
    deleteNote: vi.fn(),
    deleteSelectedNotes: vi.fn(),
    duplicateNote: vi.fn(),
    pinNote: vi.fn(),
    unpinNote: vi.fn(),
    isLoading: false,
    settings: {},
    noteListDateMode: "modified",
    noteListPreviewLines: 2,
    showNoteListFilename: false,
    showNoteListFolderPath: true,
    showNoteListPreview: true,
    ...overrides,
  } as never;
}

describe("NoteList", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-26T12:00:00Z"));

    const notesContext = await import("../../context/NotesContext");
    vi.mocked(notesContext.useNotes).mockReturnValue(makeNotesHookValue());

    const themeContext = await import("../../context/ThemeContext");
    vi.mocked(themeContext.useTheme).mockReturnValue({
      confirmDeletions: true,
      setConfirmDeletions: vi.fn(),
    } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("collapses to a compact single-line row when all secondary fields are off", async () => {
    const notesContext = await import("../../context/NotesContext");
    vi.mocked(notesContext.useNotes).mockReturnValue(
      makeNotesHookValue({
        noteListDateMode: "off",
        showNoteListFilename: false,
        showNoteListFolderPath: false,
        noteListPreviewLines: 0,
      }),
    );

    render(<NoteList items={[baseItem]} emptyMessage="Empty" />);

    const row = screen.getByRole("button", { name: /Alpha note/ });
    expect(row).toHaveClass("py-1.75");
    expect(screen.queryByText("work/")).not.toBeInTheDocument();
    expect(screen.queryByText("planning")).not.toBeInTheDocument();
    expect(screen.queryByText("Yesterday")).not.toBeInTheDocument();
  });

  it("renders the created date when date mode is set to created", async () => {
    const notesContext = await import("../../context/NotesContext");
    vi.mocked(notesContext.useNotes).mockReturnValue(
      makeNotesHookValue({
        noteListDateMode: "created",
        showNoteListFolderPath: false,
        noteListPreviewLines: 0,
      }),
    );

    render(<NoteList items={[baseItem]} emptyMessage="Empty" />);

    expect(screen.getByText("Yesterday")).toBeInTheDocument();
  });

  it("renders the filename in the metadata line when enabled", async () => {
    const notesContext = await import("../../context/NotesContext");
    vi.mocked(notesContext.useNotes).mockReturnValue(
      makeNotesHookValue({
        noteListDateMode: "off",
        showNoteListFilename: true,
        showNoteListFolderPath: false,
        noteListPreviewLines: 0,
      }),
    );

    render(<NoteList items={[baseItem]} emptyMessage="Empty" />);

    expect(screen.getByText("alpha.md")).toBeInTheDocument();
    expect(screen.queryByText("work/")).not.toBeInTheDocument();
  });

  it("renders only the folder path when preview and date are off", async () => {
    const notesContext = await import("../../context/NotesContext");
    vi.mocked(notesContext.useNotes).mockReturnValue(
      makeNotesHookValue({
        noteListDateMode: "off",
        showNoteListFolderPath: true,
        noteListPreviewLines: 0,
      }),
    );

    render(<NoteList items={[baseItem]} emptyMessage="Empty" />);

    expect(screen.getByText("work/")).toBeInTheDocument();
    expect(screen.queryByText("planning")).not.toBeInTheDocument();
  });

  it("renders only the preview text when folder path and date are off", async () => {
    const notesContext = await import("../../context/NotesContext");
    vi.mocked(notesContext.useNotes).mockReturnValue(
      makeNotesHookValue({
        noteListDateMode: "off",
        showNoteListFolderPath: false,
        noteListPreviewLines: 2,
      }),
    );

    render(<NoteList items={[baseItem]} emptyMessage="Empty" />);

    expect(screen.getByText("planning")).toBeInTheDocument();
    expect(screen.queryByText("work/")).not.toBeInTheDocument();
  });

  it("combines date, folder path, and preview when multiple view settings are enabled", async () => {
    render(<NoteList items={[baseItem]} emptyMessage="Empty" />);

    const row = screen.getByRole("button", { name: /Alpha note/ });
    expect(row).toHaveClass("py-2.25");
    expect(screen.getByText("3 days ago")).toBeInTheDocument();
    expect(screen.getByText("work/ · planning")).toBeInTheDocument();
  });

  it("appends the filename to the folder path when both are enabled", async () => {
    const notesContext = await import("../../context/NotesContext");
    vi.mocked(notesContext.useNotes).mockReturnValue(
      makeNotesHookValue({
        noteListDateMode: "off",
        showNoteListFilename: true,
        showNoteListFolderPath: true,
        noteListPreviewLines: 0,
      }),
    );

    render(<NoteList items={[baseItem]} emptyMessage="Empty" />);

    expect(screen.getByText("work/alpha.md")).toBeInTheDocument();
  });

  it("gives multi-line preview modes full preview lines by stacking the path label", async () => {
    const notesContext = await import("../../context/NotesContext");
    vi.mocked(notesContext.useNotes).mockReturnValue(
      makeNotesHookValue({
        noteListDateMode: "off",
        noteListPreviewLines: 3,
        showNoteListFilename: true,
        showNoteListFolderPath: true,
      }),
    );

    render(<NoteList items={[baseItem]} emptyMessage="Empty" />);

    expect(screen.getByText("work/alpha.md · planning")).toBeInTheDocument();
  });
});

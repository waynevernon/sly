import { act, fireEvent, render, screen } from "@testing-library/react";
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

const baseEmptyState = {
  kind: "notes" as const,
  title: "Empty",
  message: "Nothing here.",
};

const secondItem: NoteListItem = {
  id: "work/bravo",
  title: "Bravo note",
  preview: "draft",
  modified: Math.floor(new Date("2026-03-24T12:00:00Z").getTime() / 1000),
  created: Math.floor(new Date("2026-03-24T12:00:00Z").getTime() / 1000),
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
    renameNote: vi.fn(),
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
    Element.prototype.scrollIntoView = vi.fn();

    const notesContext = await import("../../context/NotesContext");
    vi.mocked(notesContext.useNotes).mockReturnValue(makeNotesHookValue());

    const themeContext = await import("../../context/ThemeContext");
    vi.mocked(themeContext.useTheme).mockReturnValue({
      confirmDeletions: true,
      setConfirmDeletions: vi.fn(),
    } as never);
  });

  afterEach(() => {
    vi.clearAllTimers();
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

    render(<NoteList items={[baseItem]} emptyState={baseEmptyState} />);

    const row = screen.getByRole("option", { name: /Alpha note/ });
    expect(row.firstElementChild).toHaveClass("py-[var(--ui-list-item-py)]");
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

    render(<NoteList items={[baseItem]} emptyState={baseEmptyState} />);

    expect(screen.getByText("Yesterday")).toBeInTheDocument();
  });

  it("refreshes relative date labels after local midnight", async () => {
    vi.setSystemTime(new Date(2026, 2, 26, 23, 59, 59, 500));
    const todayItem: NoteListItem = {
      ...baseItem,
      modified: Math.floor(new Date(2026, 2, 26, 12, 0, 0).getTime() / 1000),
    };

    render(<NoteList items={[todayItem]} emptyState={baseEmptyState} />);

    expect(screen.getByText(/\d{1,2}:\d{2}/)).toBeInTheDocument();

    act(() => {
      vi.setSystemTime(new Date(2026, 2, 27, 0, 0, 0, 100));
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText("Yesterday · work/")).toBeInTheDocument();
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

    render(<NoteList items={[baseItem]} emptyState={baseEmptyState} />);

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

    render(<NoteList items={[baseItem]} emptyState={baseEmptyState} />);

    expect(screen.getByText("work/")).toBeInTheDocument();
    expect(screen.queryByText("planning")).not.toBeInTheDocument();
  });

  it("hides the folder path when the setting is off", async () => {
    const notesContext = await import("../../context/NotesContext");
    vi.mocked(notesContext.useNotes).mockReturnValue(
      makeNotesHookValue({
        noteListDateMode: "off",
        showNoteListFolderPath: false,
        noteListPreviewLines: 0,
      }),
    );

    render(<NoteList items={[baseItem]} emptyState={baseEmptyState} />);

    expect(screen.queryByText("work/")).not.toBeInTheDocument();
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

    render(<NoteList items={[baseItem]} emptyState={baseEmptyState} />);

    expect(screen.getByText("planning")).toBeInTheDocument();
    expect(screen.queryByText("work/")).not.toBeInTheDocument();
  });

  it("combines date, folder path, and preview when multiple view settings are enabled", async () => {
    render(<NoteList items={[baseItem]} emptyState={baseEmptyState} />);

    const row = screen.getByRole("option", { name: /Alpha note/ });
    expect(row.firstElementChild).toHaveClass("py-[var(--ui-list-item-py-tall)]");
    expect(screen.getByText("planning")).toBeInTheDocument();
    expect(screen.getByText("3 days ago · work/")).toBeInTheDocument();
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

    render(<NoteList items={[baseItem]} emptyState={baseEmptyState} />);

    expect(screen.getByText("work/alpha.md")).toBeInTheDocument();
  });

  it("renders preview lines above the metadata line in multi-line modes", async () => {
    const notesContext = await import("../../context/NotesContext");
    vi.mocked(notesContext.useNotes).mockReturnValue(
      makeNotesHookValue({
        noteListDateMode: "modified",
        noteListPreviewLines: 3,
        showNoteListFilename: true,
        showNoteListFolderPath: true,
      }),
    );

    render(<NoteList items={[baseItem]} emptyState={baseEmptyState} />);

    const preview = screen.getByText("planning");
    const meta = screen.getByText("3 days ago · work/alpha.md");
    const metaRow = meta.parentElement;
    expect(
      preview.compareDocumentPosition(meta) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(metaRow).toHaveClass("flex-col", "items-start");
  });

  it("keeps the 3-line preview mode clamped to exactly three lines", async () => {
    const notesContext = await import("../../context/NotesContext");
    vi.mocked(notesContext.useNotes).mockReturnValue(
      makeNotesHookValue({
        noteListPreviewLines: 3,
      }),
    );

    render(<NoteList items={[baseItem]} emptyState={baseEmptyState} />);

    expect(screen.getByText("planning")).toHaveClass("line-clamp-3");
  });

  it("styles preview text more prominently than the metadata line", async () => {
    render(<NoteList items={[baseItem]} emptyState={baseEmptyState} />);

    expect(screen.getByText("planning")).toHaveClass("text-text", "opacity-75");
    expect(screen.getByText("3 days ago · work/")).toHaveClass(
      "text-text-muted",
      "opacity-60",
    );
  });

  it("exposes note rows as listbox options", async () => {
    render(
      <NoteList items={[baseItem, secondItem]} emptyState={baseEmptyState} />,
    );

    expect(screen.getByRole("listbox", { name: "Notes" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Alpha note/ })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("tracks the active note with aria-activedescendant", async () => {
    const notesContext = await import("../../context/NotesContext");
    vi.mocked(notesContext.useNotes).mockReturnValue(
      makeNotesHookValue({
        selectedNoteId: secondItem.id,
        selectedNoteIds: [secondItem.id],
      }),
    );

    render(
      <NoteList items={[baseItem, secondItem]} emptyState={baseEmptyState} />,
    );

    const listbox = screen.getByRole("listbox", { name: "Notes" });
    expect(listbox).toHaveAttribute(
      "aria-activedescendant",
      "note-option-work%2Fbravo",
    );
    expect(screen.getByText("Bravo note").closest(".bg-bg-emphasis")).not.toHaveClass(
      "group-focus-visible/notelist:ring-1",
      "group-focus-visible/notelist:ring-text-muted",
    );
  });

  it("requests inline filename editing from the editor when rename is chosen", async () => {
    const dispatchEventSpy = vi.spyOn(window, "dispatchEvent");
    render(<NoteList items={[baseItem]} emptyState={baseEmptyState} />);

    const row = screen.getByRole("option", { name: /Alpha note/ });
    fireEvent.contextMenu(row);
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename File…" }));
    vi.runOnlyPendingTimers();

    expect(dispatchEventSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "request-note-filename-edit",
        detail: "work/alpha",
      }),
    );
  });
});

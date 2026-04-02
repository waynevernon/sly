import type { NoteMetadata } from "../../types/note";

export function shouldShowPendingSelectionSpinner(
  selectedNoteId: string | null,
  notes: NoteMetadata[] | undefined,
): boolean {
  if (selectedNoteId === null) {
    return false;
  }

  if (!notes) {
    return true;
  }

  return notes.some((note) => note.id === selectedNoteId);
}

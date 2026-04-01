import { useEffect } from "react";
import { AlertCircle } from "lucide-react";
import { useNotes } from "../../context/NotesContext";
import * as notesService from "../../services/notes";
import { DetachedEditorWindow } from "./DetachedEditorWindow";
import { Editor } from "../editor/Editor";

interface WorkspaceNoteAppProps {
  noteId: string;
}

export function WorkspaceNoteApp({ noteId }: WorkspaceNoteAppProps) {
  const {
    selectNote,
    currentNote,
    selectedNoteId,
    isLoading,
    error,
    reloadCurrentNote,
  } = useNotes();

  useEffect(() => {
    void selectNote(noteId);
  }, [noteId, selectNote]);

  useEffect(() => {
    if (!currentNote?.id) {
      return;
    }

    void notesService
      .syncNoteWindowIdentity(currentNote.id, currentNote.title)
      .catch((syncError) => {
        console.error("Failed to sync detached note window identity:", syncError);
      });
  }, [currentNote?.id, currentNote?.title]);

  const showError = !isLoading && selectedNoteId === noteId && !currentNote && error;

  return (
    <DetachedEditorWindow
      presentation="interactive"
      onReload={reloadCurrentNote}
    >
      {({ focusMode, onEditorReady }) =>
        showError ? (
          <div className="flex-1 flex items-center justify-center px-8">
            <div className="max-w-sm text-center text-text-muted">
              <AlertCircle className="w-6 h-6 mx-auto mb-3 stroke-[1.6]" />
              <div className="text-sm font-medium text-text mb-1">
                Couldn&apos;t open this note
              </div>
              <div className="text-sm">{error}</div>
            </div>
          </div>
        ) : (
          <Editor
            focusMode={focusMode}
            onEditorReady={onEditorReady}
            showPinControl={false}
          />
        )
      }
    </DetachedEditorWindow>
  );
}

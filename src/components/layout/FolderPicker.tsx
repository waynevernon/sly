import { open } from "@tauri-apps/plugin-dialog";
import { useNotes } from "../../context/NotesContext";
import { Button } from "../ui";

export function FolderPicker() {
  const { setNotesFolder } = useNotes();

  const handleSelectFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Choose Notes Folder",
      });

      if (selected && typeof selected === "string") {
        await setNotesFolder(selected);
      }
    } catch (err) {
      console.error("Failed to select folder:", err);
    }
  };

  return (
    <div className="h-full flex flex-col bg-bg-secondary">
      {/* Draggable title bar area */}
      <div className="h-10 shrink-0" data-tauri-drag-region />

      <div className="flex-1 flex items-center justify-center">
        <div className="text-center p-8 max-w-lg select-none -mt-4">
          <img
            src="/folders-dark.png"
            alt="Folders"
            className="w-88 max-w-[min(34rem,90vw)] h-auto mx-auto mb-0 animate-fade-in-up"
            style={{ animationDelay: "0ms" }}
          />

          <h1
            className="text-3xl text-text font-sans mb-1.5 tracking-[-0.01em] animate-fade-in-up"
            style={{ animationDelay: "100ms" }}
          >
            Welcome to Sly
          </h1>
          <p
            className="text-text-muted mb-6 animate-fade-in-up"
            style={{ animationDelay: "100ms" }}
          >
            Choose a folder to get started. Your notes live here as plain
            markdown files, and your tasks are stored in the same vault.
          </p>
          <div
            className="animate-fade-in-up"
            style={{ animationDelay: "200ms" }}
          >
            <Button onClick={handleSelectFolder} size="xl">
              Choose your notes folder
            </Button>
          </div>

          <p
            className="mt-2 text-xs text-text-muted/60 animate-fade-in-up"
            style={{ animationDelay: "300ms" }}
          >
            You can change this later
          </p>
        </div>
      </div>
    </div>
  );
}

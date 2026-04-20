import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { SquareArrowUpLeft } from "lucide-react";
import { getFilenameSyncSuggestion, getNoteLeaf } from "../../lib/noteIdentity";
import { cn } from "../../lib/utils";
import { IconButton } from "../ui";

interface EditorFilenameFieldProps {
  noteId: string;
  documentTitle: string;
  onRename: (nextName: string) => Promise<void>;
}

const filenameFieldShellClassName =
  "ui-focus-ring -mx-2 inline-flex max-w-full items-center rounded-[var(--ui-radius-md)] border border-transparent bg-transparent px-2 text-xs font-medium leading-none text-text-muted shadow-none transition-colors";

export function EditorFilenameField({
  noteId,
  documentTitle,
  onRename,
}: EditorFilenameFieldProps) {
  const filename = getNoteLeaf(noteId);
  const filenameWithExtension = `${filename}.md`;
  const [isEditing, setIsEditing] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [draft, setDraft] = useState(filename);
  const inputRef = useRef<HTMLInputElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [draftWidth, setDraftWidth] = useState(1);
  const syncSuggestion = useMemo(
    () => getFilenameSyncSuggestion(noteId, documentTitle),
    [documentTitle, noteId],
  );

  useEffect(() => {
    setDraft(filename);
    setIsEditing(false);
    setIsRenaming(false);
  }, [filename, noteId]);

  useLayoutEffect(() => {
    const measuredWidth = measureRef.current?.offsetWidth ?? 0;
    setDraftWidth(Math.max(measuredWidth, 1));
  }, [draft, isEditing]);

  useEffect(() => {
    if (!isEditing) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });

    return () => cancelAnimationFrame(frame);
  }, [isEditing]);

  const handleRename = useCallback(
    async (nextName: string) => {
      setIsRenaming(true);
      try {
        await onRename(nextName);
        setIsEditing(false);
      } finally {
        setIsRenaming(false);
      }
    },
    [onRename],
  );

  const handleSubmit = useCallback(async () => {
    if (isRenaming) {
      return;
    }

    const trimmed = draft.trim();
    if (!trimmed || trimmed === filename.trim()) {
      setDraft(filename);
      setIsEditing(false);
      return;
    }

    await handleRename(trimmed);
  }, [draft, filename, handleRename, isRenaming]);

  const handleSync = useCallback(async () => {
    if (!syncSuggestion || isRenaming) {
      return;
    }

    setIsRenaming(true);
    try {
      await onRename(syncSuggestion);
      setIsEditing(false);
    } finally {
      setIsRenaming(false);
    }
  }, [isRenaming, onRename, syncSuggestion]);

  return (
    <div className="mb-3 flex items-center gap-1.5">
      <div className="min-w-0 flex-1">
        <div
          role={!isEditing ? "button" : undefined}
          tabIndex={!isEditing ? 0 : undefined}
          className={cn(
            filenameFieldShellClassName,
            isEditing
              ? "bg-bg"
              : "hover:bg-bg-muted hover:text-text",
          )}
          aria-label={!isEditing ? `Edit filename ${filenameWithExtension}` : undefined}
          onClick={() => {
            if (!isEditing) {
              setIsEditing(true);
            }
          }}
          onKeyDown={(event) => {
            if (isEditing) {
              return;
            }

            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setIsEditing(true);
            }
          }}
        >
          <span
            ref={measureRef}
            aria-hidden="true"
            className="pointer-events-none invisible absolute whitespace-pre py-1 text-xs font-medium"
          >
            {draft || " "}
          </span>
          <div
            className="relative py-1"
            style={{
              width: `${draftWidth}px`,
            }}
          >
            <span
              aria-hidden="true"
              className="block whitespace-pre text-xs font-medium leading-none"
            >
              {draft || " "}
            </span>
            <input
              ref={inputRef}
              value={draft}
              disabled={isRenaming}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => {
                if (isEditing) {
                  void handleSubmit();
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.stopPropagation();
                  void handleSubmit();
                  return;
                }

                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  setDraft(filename);
                  setIsEditing(false);
                }
              }}
              aria-label="Edit filename"
              placeholder="Untitled"
              className={cn(
                "absolute inset-0 w-full border-0 bg-transparent p-0 text-xs font-medium leading-none outline-none placeholder:text-transparent",
                isEditing
                  ? "text-transparent caret-text-muted"
                  : "pointer-events-none opacity-0",
              )}
            />
          </div>
          <span
            aria-hidden="true"
            className="shrink-0 py-1 text-xs font-medium leading-none text-text-muted/70"
          >
            .md
          </span>
        </div>
      </div>

      <div className="flex h-[var(--ui-control-height-compact)] w-[var(--ui-control-height-compact)] shrink-0 items-center justify-center">
        {syncSuggestion ? (
          <IconButton
            size="xs"
            variant="ghost"
            onClick={() => void handleSync()}
            disabled={isRenaming}
            title="Use first line as filename"
          >
            <SquareArrowUpLeft className="w-4 h-4 stroke-[1.6]" />
          </IconButton>
        ) : null}
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, X } from "lucide-react";
import { toast } from "sonner";
import { useTasks } from "../../context/TasksContext";
import {
  detectTaskDateFromTitle,
  deriveView,
  localDateToNormalizedActionAt,
  TASK_VIEW_LABELS,
} from "../../lib/tasks";
import { mod } from "../../lib/platform";
import { cn } from "../../lib/utils";
import type { TaskScheduleBucket } from "../../types/tasks";
import { Button, DialogShell } from "../ui";
import { TaskDatePicker } from "./TaskDatePicker";

interface GlobalTaskCaptureDialogProps {
  open: boolean;
  workspaceMode: "notes" | "tasks";
  onClose: () => void;
}

const CAPTURE_DATE_DEBOUNCE_MS = 350;

export function GlobalTaskCaptureDialog({
  open,
  workspaceMode,
  onClose,
}: GlobalTaskCaptureDialogProps) {
  const {
    createTask,
    updateTask,
    selectTask,
    selectView,
    today,
  } = useTasks();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [link, setLink] = useState("");
  const [manualActionDate, setManualActionDate] = useState("");
  const [manualScheduleBucket, setManualScheduleBucket] = useState<TaskScheduleBucket | null>(null);
  const [detectedDate, setDetectedDate] = useState<ReturnType<typeof detectTaskDateFromTitle>>(null);
  const [ignoredDetectionSignature, setIgnoredDetectionSignature] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;

    setTitle("");
    setDescription("");
    setLink("");
    setManualActionDate("");
    setManualScheduleBucket(null);
    setDetectedDate(null);
    setIgnoredDetectionSignature(null);
    setIsSaving(false);

    const focusTimer = window.setTimeout(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }, 0);

    return () => window.clearTimeout(focusTimer);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    if (!title.trim()) {
      setDetectedDate(null);
      return;
    }

    const timer = window.setTimeout(() => {
      const nextDetection = detectTaskDateFromTitle(title, today);
      if (!nextDetection || nextDetection.signature === ignoredDetectionSignature) {
        setDetectedDate(null);
        return;
      }

      setDetectedDate(nextDetection);
    }, CAPTURE_DATE_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [ignoredDetectionSignature, open, title, today]);

  const handleClose = useCallback(() => {
    if (isSaving) return;
    onClose();
  }, [isSaving, onClose]);

  const handleSubmit = useCallback(async () => {
    const nextDetection = detectTaskDateFromTitle(title, today);
    const activeDetection =
      nextDetection && nextDetection.signature !== ignoredDetectionSignature
        ? nextDetection
        : null;
    const trimmedTitle = (activeDetection?.cleanedTitle ?? title).trim();
    if (!trimmedTitle || isSaving) {
      return;
    }

    const effectiveActionDate =
      manualScheduleBucket ? "" : manualActionDate || activeDetection?.localDate || "";

    setIsSaving(true);
    try {
      const created = await createTask(trimmedTitle);
      if (!created) {
        return;
      }

      const patch = {
        description,
        link,
        actionAt: localDateToNormalizedActionAt(effectiveActionDate),
        scheduleBucket: manualScheduleBucket,
      };

      const hasPatch =
        description.trim().length > 0 ||
        link.trim().length > 0 ||
        Boolean(effectiveActionDate) ||
        Boolean(manualScheduleBucket);

      const finalTask = hasPatch
        ? await updateTask(created.id, patch)
        : created;

      const effectiveTask = finalTask ?? created;
      const targetView = deriveView(effectiveTask, today);

      if (workspaceMode === "tasks") {
        selectView(targetView);
        selectTask(effectiveTask.id);
      }

      toast.success(`Task added to ${TASK_VIEW_LABELS[targetView]}`);
      onClose();
    } finally {
      setIsSaving(false);
    }
  }, [
    createTask,
    description,
    ignoredDetectionSignature,
    isSaving,
    link,
    manualActionDate,
    manualScheduleBucket,
    onClose,
    selectTask,
    selectView,
    title,
    today,
    updateTask,
    workspaceMode,
  ]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleClose();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        void handleSubmit();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleClose, handleSubmit, open]);

  const canSubmit = title.trim().length > 0 && !isSaving;
  const submitShortcutLabel = useMemo(() => `${mod}+Enter`, []);
  const effectiveActionDate =
    manualScheduleBucket ? "" : manualActionDate || detectedDate?.localDate || "";
  const showDetectedDateChip = Boolean(detectedDate && !manualActionDate && !manualScheduleBucket);

  if (!open) return null;

  return (
    <DialogShell
      onBackdropClick={handleClose}
      panelClassName="max-w-2xl"
    >
      <div className="px-6 py-6 sm:px-7">
        <div
          className="grid gap-x-4 gap-y-4"
          style={{ gridTemplateColumns: "20px minmax(0, 1fr)" }}
        >
          <div />
          <div className="flex items-start gap-3">
            <input
              ref={titleInputRef}
              value={title}
              placeholder="What needs doing?"
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void handleSubmit();
                }
              }}
              className="min-w-0 flex-1 bg-transparent text-2xl font-medium leading-tight text-text outline-none placeholder:text-text-muted/50"
            />
            <button
              type="button"
              onClick={handleClose}
              className="ui-focus-ring inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--ui-radius-md)] text-text-muted transition-colors hover:bg-bg-muted hover:text-text"
              aria-label="Close task capture"
            >
              <X className="h-4 w-4 stroke-[1.9]" />
            </button>
          </div>

          <div />
          <div className="flex flex-wrap items-center gap-2">
            <TaskDatePicker
              actionDate={effectiveActionDate}
              scheduleBucket={manualScheduleBucket}
              today={today}
              onChange={({ actionDate, scheduleBucket }) => {
                setManualActionDate(actionDate ?? "");
                setManualScheduleBucket(scheduleBucket);
              }}
            />
            {showDetectedDateChip ? (
              <div className="inline-flex h-[var(--ui-control-height-compact)] items-center gap-1.5 rounded-[var(--ui-radius-md)] bg-bg-muted/70 px-2.5 text-xs font-medium text-text-muted">
                <CalendarClock className="h-3.5 w-3.5 shrink-0 stroke-[1.8]" />
                <span>Date: {detectedDate?.label}</span>
                <button
                  type="button"
                  aria-label="Dismiss detected date"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    if (!detectedDate) return;
                    setIgnoredDetectionSignature(detectedDate.signature);
                    setDetectedDate(null);
                    titleInputRef.current?.focus();
                  }}
                  className="ui-focus-ring inline-flex h-4 w-4 items-center justify-center rounded-[var(--ui-radius-sm)] text-text-muted transition-colors hover:bg-bg hover:text-text"
                >
                  <X className="h-3 w-3 stroke-[2]" />
                </button>
              </div>
            ) : null}
          </div>

          <div />
          <div className="space-y-2">
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted/65">
              Link
            </div>
            <input
              value={link}
              placeholder="Add link…"
              onChange={(event) => setLink(event.target.value)}
              className="w-full bg-transparent text-sm leading-relaxed text-text outline-none placeholder:text-text-muted/40"
            />
          </div>

          <div />
          <div className="border-t border-border/40" />

          <div />
          <div className="space-y-2">
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted/65">
              Description
            </div>
            <textarea
              value={description}
              placeholder="Add description…"
              onChange={(event) => setDescription(event.target.value)}
              rows={5}
              className="min-h-[140px] w-full resize-none bg-transparent text-sm leading-relaxed text-text outline-none placeholder:text-text-muted/40"
            />
          </div>

          <div />
          <div className="flex items-center justify-end gap-2 border-t border-border/40 pt-3">
            <div className="mr-auto text-xs text-text-muted">{submitShortcutLabel}</div>
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={handleClose}
              disabled={isSaving}
              className={cn("text-text-muted hover:text-text")}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="default"
              size="md"
              onClick={() => void handleSubmit()}
              disabled={!canSubmit}
            >
              {isSaving ? "Creating..." : "Create Task"}
            </Button>
          </div>
        </div>
      </div>
    </DialogShell>
  );
}

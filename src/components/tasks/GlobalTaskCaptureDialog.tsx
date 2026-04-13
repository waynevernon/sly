import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, Clock3, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import { useTasks } from "../../context/TasksContext";
import {
  detectTaskDateFromTitle,
  deriveView,
  localDateToNormalizedActionAt,
  TASK_VIEW_LABELS,
} from "../../lib/tasks";
import { cn } from "../../lib/utils";
import type { TaskScheduleBucket } from "../../types/tasks";
import { Button, DialogShell, PopoverSurface } from "../ui";
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
    tasks,
    updateTask,
    selectTask,
    selectView,
    today,
  } = useTasks();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [link, setLink] = useState("");
  const [waitingFor, setWaitingFor] = useState("");
  const [waitingForFocused, setWaitingForFocused] = useState(false);
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
    setWaitingFor("");
    setWaitingForFocused(false);
    setManualActionDate("");
    setManualScheduleBucket(null);
    setDetectedDate(null);
    setIgnoredDetectionSignature(null);
    setIsSaving(false);
    titleInputRef.current?.focus();
    titleInputRef.current?.select();
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
        waitingFor: waitingFor.trim(),
        actionAt: localDateToNormalizedActionAt(effectiveActionDate),
        scheduleBucket: manualScheduleBucket,
      };

      const hasPatch =
        description.trim().length > 0 ||
        link.trim().length > 0 ||
        waitingFor.trim().length > 0 ||
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
    waitingFor,
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

    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleClose, handleSubmit, open]);

  const canSubmit = title.trim().length > 0 && !isSaving;
  const effectiveActionDate =
    manualScheduleBucket ? "" : manualActionDate || "";
  const showDetectedDateChip = Boolean(detectedDate && !manualActionDate && !manualScheduleBucket);
  const titleHighlight = useMemo(() => {
    if (!showDetectedDateChip || !detectedDate) return null;
    const lower = title.toLowerCase();
    const matchedLower = detectedDate.matchedText.toLowerCase();
    const start = lower.indexOf(matchedLower);
    if (start === -1) return null;
    return { start, end: start + detectedDate.matchedText.length };
  }, [showDetectedDateChip, detectedDate, title]);
  const waitingForSuggestions = useMemo(() => {
    const counts = new Map<string, { value: string; count: number }>();

    for (const task of tasks) {
      const candidate = task.waitingFor.trim();
      if (!candidate) continue;

      const key = candidate.toLocaleLowerCase();
      const existing = counts.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(key, { value: candidate, count: 1 });
      }
    }

    return [...counts.values()]
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
      .map((entry) => entry.value);
  }, [tasks]);
  const filteredWaitingForSuggestions = useMemo(() => {
    const query = waitingFor.trim().toLocaleLowerCase();
    return waitingForSuggestions
      .filter((value) => {
        const normalized = value.toLocaleLowerCase();
        if (!query) return true;
        if (normalized === query) return false;
        return normalized.includes(query);
      })
      .slice(0, 6);
  }, [waitingFor, waitingForSuggestions]);
  const showWaitingForSuggestions =
    waitingForFocused && filteredWaitingForSuggestions.length > 0;

  if (!open) return null;

  return (
    <DialogShell
      onBackdropClick={handleClose}
      panelClassName="max-w-xl"
    >
      <div className="relative mx-auto w-full max-w-[38rem] px-6 py-5">
        <button
          type="button"
          onClick={handleClose}
          className="ui-focus-ring absolute right-6 top-5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--ui-radius-md)] text-text-muted transition-colors hover:bg-bg-muted hover:text-text"
          aria-label="Close task capture"
        >
          <X className="h-4.5 w-4.5 stroke-[1.5]" />
        </button>
        <div className="flex flex-col gap-4">
          <div className="pointer-events-none relative pr-10">
            {titleHighlight && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 flex items-center overflow-hidden whitespace-pre text-[1.7rem] font-medium leading-tight text-transparent"
              >
                {title.slice(0, titleHighlight.start)}
                <span className="rounded-[var(--ui-radius-sm)] bg-accent/12">
                  {title.slice(titleHighlight.start, titleHighlight.end)}
                </span>
                {title.slice(titleHighlight.end)}
              </div>
            )}
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
              className="pointer-events-auto relative min-w-0 flex-1 bg-transparent text-[1.7rem] font-medium leading-tight text-text outline-none placeholder:text-text-muted/50"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!showDetectedDateChip && (
              <TaskDatePicker
                actionDate={effectiveActionDate}
                scheduleBucket={manualScheduleBucket}
                today={today}
                onChange={({ actionDate, scheduleBucket }) => {
                  setManualActionDate(actionDate ?? "");
                  setManualScheduleBucket(scheduleBucket);
                }}
              />
            )}
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
            <div className="relative min-w-[200px] flex-1">
              <div className="flex h-[var(--ui-control-height-standard)] items-center gap-2 rounded-[var(--ui-radius-md)] bg-bg-muted/70 px-3 text-sm text-text">
                <Clock3 className="h-4 w-4 shrink-0 stroke-[1.7] text-text-muted" />
                <input
                  value={waitingFor}
                  placeholder="Waiting for…"
                  onChange={(event) => setWaitingFor(event.target.value)}
                  onFocus={() => setWaitingForFocused(true)}
                  onBlur={() => setWaitingForFocused(false)}
                  className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-text-muted/40"
                />
              </div>
              {showWaitingForSuggestions ? (
                <PopoverSurface className="absolute left-0 top-[calc(100%+8px)] z-20 w-full p-1.5">
                  <div className="flex flex-col gap-1">
                    {filteredWaitingForSuggestions.map((value) => (
                      <button
                        key={value}
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          setWaitingFor(value);
                          setWaitingForFocused(false);
                        }}
                        className="ui-focus-ring flex w-full items-center gap-2 rounded-[var(--ui-radius-md)] px-2.5 py-2 text-left text-sm text-text transition-colors hover:bg-bg-muted"
                      >
                        <UserRound className="h-3.5 w-3.5 shrink-0 stroke-[1.8] text-text-muted" />
                        <span className="truncate">{value}</span>
                      </button>
                    ))}
                  </div>
                </PopoverSurface>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-[11px] font-medium text-text-muted">
              Link
            </div>
            <input
              value={link}
              placeholder="Add link…"
              onChange={(event) => setLink(event.target.value)}
              className="w-full bg-transparent text-sm leading-relaxed text-text outline-none placeholder:text-text-muted/40"
            />
          </div>

          <div className="border-t border-border/40" />

          <div className="space-y-2">
            <div className="text-[11px] font-medium text-text-muted">
              Description
            </div>
            <textarea
              value={description}
              placeholder="Add description…"
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
              className="min-h-[72px] w-full resize-none bg-transparent text-sm leading-relaxed text-text outline-none placeholder:text-text-muted/40"
            />
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border/40 pt-3">
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

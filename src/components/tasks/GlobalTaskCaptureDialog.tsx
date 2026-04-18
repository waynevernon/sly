import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, Clock3, X } from "lucide-react";
import { toast } from "sonner";
import { useTasks } from "../../context/TasksContext";
import {
  detectTaskDateFromTitle,
  detectTaskUrlFromTitle,
  deriveView,
  localDateToNormalizedActionAt,
  TASK_VIEW_LABELS,
} from "../../lib/tasks";
import { cn } from "../../lib/utils";
import type { TaskScheduleBucket } from "../../types/tasks";
import { Button, DialogShell, PopoverTextEditor } from "../ui";
import { DueDatePicker, TaskDatePicker } from "./TaskDatePicker";
import { RecurrencePicker } from "./RecurrencePicker";
import {
  TASK_DETAIL_DIVIDER_CLASS,
  TASK_DETAIL_FIELD_INPUT_CLASS,
  TASK_DETAIL_FILLED_TRIGGER_CLASS,
  TASK_DETAIL_LABEL_CLASS,
  TASK_DETAIL_SECTION_CLASS,
} from "./taskDetailSurface";

interface GlobalTaskCaptureDialogProps {
  open: boolean;
  workspaceMode: "notes" | "tasks";
  onClose: () => void;
}

const CAPTURE_DATE_DEBOUNCE_MS = 350;

function renderTitleHighlights(
  text: string,
  highlights: Array<{ start: number; end: number }>,
) {
  const segments: ReactNode[] = [];
  let cursor = 0;
  for (const { start, end } of highlights) {
    if (start > cursor) segments.push(text.slice(cursor, start));
    segments.push(
      <span key={start} className="rounded-[var(--ui-radius-sm)] bg-accent/12">
        {text.slice(start, end)}
      </span>,
    );
    cursor = end;
  }
  if (cursor < text.length) segments.push(text.slice(cursor));
  return segments;
}

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
  const [waitingEditorOpen, setWaitingEditorOpen] = useState(false);
  const [recurrence, setRecurrence] = useState<string | null>(null);
  const [manualActionDate, setManualActionDate] = useState("");
  const [manualScheduleBucket, setManualScheduleBucket] = useState<TaskScheduleBucket | null>(null);
  const [manualDueDate, setManualDueDate] = useState("");
  const [detectedDate, setDetectedDate] = useState<ReturnType<typeof detectTaskDateFromTitle>>(null);
  const [ignoredDetectionSignature, setIgnoredDetectionSignature] = useState<string | null>(null);
  const [detectedUrl, setDetectedUrl] = useState<ReturnType<typeof detectTaskUrlFromTitle>>(null);
  const [ignoredUrlSignature, setIgnoredUrlSignature] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const titleOverlayRef = useRef<HTMLSpanElement>(null);
  // Tracks the URL that was auto-populated into the link field so we can
  // distinguish it from a value the user typed manually.
  const autoPopulatedLinkRef = useRef<string | null>(null);
  // Mirror of link state kept in a ref so the URL detection effect can read
  // it without adding link to its own dependency array (which would cause a
  // circular loop when the effect auto-populates link).
  const linkRef = useRef(link);
  linkRef.current = link;

  const syncTitleOverlayScroll = useCallback(() => {
    if (titleOverlayRef.current && titleInputRef.current) {
      titleOverlayRef.current.style.transform =
        `translateX(-${titleInputRef.current.scrollLeft}px)`;
    }
  }, []);

  useEffect(() => {
    if (!open) return;

    setTitle("");
    setDescription("");
    setLink("");
    setWaitingFor("");
    setWaitingEditorOpen(false);
    setRecurrence(null);
    setManualActionDate("");
    setManualScheduleBucket(null);
    setManualDueDate("");
    setDetectedDate(null);
    setIgnoredDetectionSignature(null);
    setDetectedUrl(null);
    setIgnoredUrlSignature(null);
    autoPopulatedLinkRef.current = null;
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

  useEffect(() => {
    if (!open || !title.trim()) {
      setDetectedUrl(null);
      return;
    }

    // If the link field has content the user typed themselves, don't interfere.
    const currentLink = linkRef.current;
    if (currentLink.trim() && currentLink !== autoPopulatedLinkRef.current) {
      setDetectedUrl(null);
      return;
    }

    const timer = window.setTimeout(() => {
      const nextDetection = detectTaskUrlFromTitle(title);

      if (!nextDetection || nextDetection.signature === ignoredUrlSignature) {
        setDetectedUrl(null);
        // URL was removed from the title — clear the link field if we put it there.
        if (autoPopulatedLinkRef.current && linkRef.current === autoPopulatedLinkRef.current) {
          setLink("");
          autoPopulatedLinkRef.current = null;
        }
        return;
      }

      setDetectedUrl(nextDetection);
      // Auto-populate the link field only when it differs (avoids re-render loops).
      if (nextDetection.url !== linkRef.current) {
        setLink(nextDetection.url);
        autoPopulatedLinkRef.current = nextDetection.url;
      }
    }, CAPTURE_DATE_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [ignoredUrlSignature, open, title]);

  const handleClose = useCallback(() => {
    if (isSaving) return;
    onClose();
  }, [isSaving, onClose]);

  const handleSubmit = useCallback(async () => {
    // Strip the URL from the title if detection is still active (not ignored by
    // the user clearing/editing the link field).
    const nextUrlDetection = detectTaskUrlFromTitle(title);
    const activeUrlDetection =
      nextUrlDetection && nextUrlDetection.signature !== ignoredUrlSignature
        ? nextUrlDetection
        : null;
    const titleAfterUrl = activeUrlDetection ? activeUrlDetection.cleanedTitle : title;
    // link is already correct — auto-populated by the detection effect or typed manually.

    const nextDetection = detectTaskDateFromTitle(titleAfterUrl, today);
    const activeDetection =
      nextDetection && nextDetection.signature !== ignoredDetectionSignature
        ? nextDetection
        : null;
    const trimmedTitle = (activeDetection?.cleanedTitle ?? titleAfterUrl).trim();
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
        recurrence,
        ...(manualDueDate
          ? { dueAt: localDateToNormalizedActionAt(manualDueDate) }
          : {}),
      };

      const hasPatch =
        description.trim().length > 0 ||
        link.trim().length > 0 ||
        waitingFor.trim().length > 0 ||
        Boolean(effectiveActionDate) ||
        Boolean(manualScheduleBucket) ||
        Boolean(recurrence) ||
        Boolean(manualDueDate);

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
    ignoredUrlSignature,
    isSaving,
    link,
    manualActionDate,
    manualDueDate,
    manualScheduleBucket,
    onClose,
    recurrence,
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
  const titleHighlights = useMemo(() => {
    const ranges: Array<{ start: number; end: number }> = [];
    const lower = title.toLowerCase();

    if (showDetectedDateChip && detectedDate) {
      const start = lower.indexOf(detectedDate.matchedText.toLowerCase());
      if (start !== -1) {
        ranges.push({ start, end: start + detectedDate.matchedText.length });
      }
    }

    if (detectedUrl) {
      const start = lower.indexOf(detectedUrl.matchedText.toLowerCase());
      if (start !== -1) {
        ranges.push({ start, end: start + detectedUrl.matchedText.length });
      }
    }

    return ranges.sort((a, b) => a.start - b.start);
  }, [showDetectedDateChip, detectedDate, detectedUrl, title]);
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
  const hasWaitingFor = waitingFor.trim().length > 0;

  if (!open) return null;

  return (
    <DialogShell
      onBackdropClick={handleClose}
      panelClassName="max-w-xl"
    >
      <div className="relative mx-auto w-full max-w-[34rem] px-4 py-5 sm:px-5">
        <button
          type="button"
          onClick={handleClose}
          className="ui-focus-ring absolute right-4 top-5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--ui-radius-md)] text-text-muted transition-colors hover:bg-bg-muted hover:text-text sm:right-5"
          aria-label="Close task capture"
        >
          <X className="h-4.5 w-4.5 stroke-[1.5]" />
        </button>
        <div className="mx-auto flex w-full max-w-[30rem] flex-col gap-4">
          <div className="pointer-events-none relative min-w-0 w-full pr-10">
            {titleHighlights.length > 0 && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 flex items-center overflow-hidden whitespace-pre text-[1.55rem] font-medium leading-tight text-transparent"
              >
                <span
                  ref={(el) => {
                    titleOverlayRef.current = el;
                    if (el) {
                      requestAnimationFrame(() => {
                        if (titleInputRef.current && el) {
                          el.style.transform = `translateX(-${titleInputRef.current.scrollLeft}px)`;
                        }
                      });
                    }
                  }}
                  className="inline-block"
                >
                  {renderTitleHighlights(title, titleHighlights)}
                </span>
              </div>
            )}
            <input
              ref={titleInputRef}
              value={title}
              placeholder="What needs doing?"
              onChange={(event) => setTitle(event.target.value)}
              onScroll={syncTitleOverlayScroll}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void handleSubmit();
                }
              }}
              className="pointer-events-auto relative min-w-0 w-full bg-transparent text-[1.55rem] font-medium leading-tight text-text outline-none placeholder:text-text-muted/50"
            />
          </div>

          <div className="flex w-full flex-wrap items-center gap-2">
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
            <DueDatePicker
              dueDate={manualDueDate}
              today={today}
              onChange={(date) => setManualDueDate(date ?? "")}
            />
            {(manualActionDate || manualScheduleBucket) && (
              <RecurrencePicker
                recurrence={recurrence}
                actionDate={manualActionDate}
                onChange={setRecurrence}
              />
            )}
            <PopoverTextEditor
              open={waitingEditorOpen}
              onOpenChange={setWaitingEditorOpen}
              value={waitingFor}
              onSubmit={setWaitingFor}
              title="Waiting"
              placeholder="Waiting…"
              icon={<Clock3 className="h-4 w-4 stroke-[1.7]" />}
              suggestions={waitingForSuggestions}
              renderTrigger={({ openEditor }) =>
                hasWaitingFor ? (
                  <button
                    type="button"
                    onClick={openEditor}
                    aria-label={`Waiting ${waitingFor}`}
                    className={TASK_DETAIL_FILLED_TRIGGER_CLASS}
                  >
                    <Clock3 className="h-4 w-4 shrink-0 stroke-[1.7] text-text-muted transition-colors group-hover:text-text" />
                    <span className="truncate text-left">{waitingFor}</span>
                  </button>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={openEditor}
                    className="gap-2"
                  >
                    <Clock3 className="h-4 w-4 stroke-[1.7]" />
                    <span>Waiting</span>
                  </Button>
                )
              }
            />
          </div>

          <div className={cn("w-full", TASK_DETAIL_DIVIDER_CLASS)} />

          <div className={cn("w-full", TASK_DETAIL_SECTION_CLASS)}>
            <div className={TASK_DETAIL_LABEL_CLASS}>
              Link
            </div>
            <input
              value={link}
              placeholder="Add link…"
              onChange={(event) => {
                const newVal = event.target.value;
                setLink(newVal);
                // If the user edits the field (value differs from what we auto-set),
                // treat it as a manual override and stop auto-populating.
                if (newVal !== autoPopulatedLinkRef.current) {
                  autoPopulatedLinkRef.current = null;
                  if (detectedUrl) {
                    setIgnoredUrlSignature(detectedUrl.signature);
                    setDetectedUrl(null);
                  }
                }
              }}
              className={TASK_DETAIL_FIELD_INPUT_CLASS}
            />
          </div>

          <div className={cn("w-full", TASK_DETAIL_DIVIDER_CLASS)} />

          <div className={cn("w-full", TASK_DETAIL_SECTION_CLASS)}>
            <div className={TASK_DETAIL_LABEL_CLASS}>
              Description
            </div>
            <textarea
              value={description}
              placeholder="Add description…"
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              className={`min-h-[104px] resize-none ${TASK_DETAIL_FIELD_INPUT_CLASS}`}
            />
          </div>

          <div className={cn("flex w-full items-center justify-end gap-2 pt-2", TASK_DETAIL_DIVIDER_CLASS)}>
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={handleClose}
              disabled={isSaving}
              className="text-text-muted hover:text-text"
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

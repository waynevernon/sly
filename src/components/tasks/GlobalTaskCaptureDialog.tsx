import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, Clock3, UserRound, X } from "lucide-react";
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
import { Button, DialogShell, PopoverSurface } from "../ui";
import { TaskDatePicker } from "./TaskDatePicker";
import { RecurrencePicker } from "./RecurrencePicker";

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
  const [waitingForEditing, setWaitingForEditing] = useState(false);
  const [waitingForFocused, setWaitingForFocused] = useState(false);
  const waitingForInputRef = useRef<HTMLInputElement>(null);
  const waitingForPendingBlurValueRef = useRef<string | null>(null);
  const [recurrence, setRecurrence] = useState<string | null>(null);
  const [manualActionDate, setManualActionDate] = useState("");
  const [manualScheduleBucket, setManualScheduleBucket] = useState<TaskScheduleBucket | null>(null);
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
    setWaitingForEditing(false);
    setWaitingForFocused(false);
    setRecurrence(null);
    setManualActionDate("");
    setManualScheduleBucket(null);
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
  // link intentionally omitted — we read it via linkRef to avoid a circular loop.
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      };

      const hasPatch =
        description.trim().length > 0 ||
        link.trim().length > 0 ||
        waitingFor.trim().length > 0 ||
        Boolean(effectiveActionDate) ||
        Boolean(manualScheduleBucket) ||
        Boolean(recurrence);

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
  const hasWaitingFor = waitingFor.trim().length > 0;
  const showWaitingForSuggestions =
    waitingForEditing && waitingForFocused && filteredWaitingForSuggestions.length > 0;

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
            {titleHighlights.length > 0 && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 flex items-center overflow-hidden whitespace-pre text-[1.7rem] font-medium leading-tight text-transparent"
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
            {(manualActionDate || manualScheduleBucket) && (
              <RecurrencePicker
                recurrence={recurrence}
                actionDate={manualActionDate}
                onChange={setRecurrence}
              />
            )}
          </div>

          <div className="relative">
            {waitingForEditing ? (
              <div className="flex h-[var(--ui-control-height-standard)] items-center gap-2 rounded-[var(--ui-radius-md)] bg-bg-muted/70 px-3 text-sm text-text">
                <Clock3 className="h-4 w-4 shrink-0 stroke-[1.7] text-text-muted" />
                <input
                  ref={waitingForInputRef}
                  type="text"
                  value={waitingFor}
                  placeholder="Waiting for…"
                  onChange={(event) => setWaitingFor(event.target.value)}
                  onFocus={() => setWaitingForFocused(true)}
                  onBlur={(event) => {
                    setWaitingForFocused(false);
                    const pendingValue = waitingForPendingBlurValueRef.current;
                    waitingForPendingBlurValueRef.current = null;
                    const resolved = (pendingValue ?? event.currentTarget.value).trim();
                    setWaitingFor(resolved);
                    setWaitingForEditing(false);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      const trimmed = event.currentTarget.value.trim();
                      waitingForPendingBlurValueRef.current = trimmed;
                      setWaitingFor(trimmed);
                      setWaitingForEditing(false);
                      waitingForInputRef.current?.blur();
                    } else if (event.key === "Escape") {
                      event.preventDefault();
                      setWaitingForEditing(false);
                      setWaitingForFocused(false);
                      waitingForInputRef.current?.blur();
                    }
                  }}
                  className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-text-muted"
                />
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setWaitingFor("");
                    setWaitingForEditing(false);
                    setWaitingForFocused(false);
                  }}
                  className="ui-focus-ring inline-flex h-5 w-5 items-center justify-center rounded-[var(--ui-radius-sm)] text-text-muted transition-colors hover:bg-bg hover:text-text"
                  aria-label="Clear waiting for"
                >
                  <X className="h-3.5 w-3.5 stroke-[1.9]" />
                </button>
              </div>
            ) : hasWaitingFor ? (
              <button
                type="button"
                onClick={() => {
                  setWaitingForEditing(true);
                  requestAnimationFrame(() => waitingForInputRef.current?.focus());
                }}
                className="ui-focus-ring inline-flex h-[var(--ui-control-height-standard)] max-w-[320px] items-center gap-2 rounded-[var(--ui-radius-md)] bg-bg-muted/70 px-3 text-sm text-text transition-colors hover:bg-bg-muted"
              >
                <Clock3 className="h-4 w-4 shrink-0 stroke-[1.7] text-text-muted" />
                <span className="truncate text-left"><span className="text-text-muted/50">Waiting for</span> {waitingFor}</span>
              </button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setWaitingForEditing(true);
                  requestAnimationFrame(() => waitingForInputRef.current?.focus());
                }}
                className="gap-2"
              >
                <Clock3 className="h-4 w-4 stroke-[1.7]" />
                <span>Waiting for</span>
              </Button>
            )}
            {showWaitingForSuggestions ? (
              <PopoverSurface className="absolute left-0 top-[calc(100%+8px)] z-20 w-full p-1.5">
                <div className="flex flex-col gap-1">
                  {filteredWaitingForSuggestions.map((value) => (
                    <button
                      key={value}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        waitingForPendingBlurValueRef.current = value;
                        setWaitingFor(value);
                        setWaitingForEditing(false);
                        waitingForInputRef.current?.blur();
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

          <div className="space-y-2">
            <div className="text-[11px] font-medium text-text-muted">
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

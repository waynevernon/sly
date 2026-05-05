import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Clock3, X } from "lucide-react";
import { toast } from "sonner";
import { useTasks } from "../../context/TasksContext";
import { useTheme } from "../../context/ThemeContext";
import { FolderGlyph } from "../folders/FolderGlyph";
import {
  getFolderAppearance,
  resolveFolderAppearanceIconColor,
  resolveFolderAppearanceTextColor,
} from "../../lib/folderIcons";
import {
  detectTaskDateFromTitle,
  detectTaskTagsFromTitle,
  detectTaskUrlFromTitle,
  deriveView,
  localDateToNormalizedActionAt,
  normalizeTaskTag,
  TASK_VIEW_LABELS,
} from "../../lib/tasks";
import { cn } from "../../lib/utils";
import type { TaskScheduleBucket } from "../../types/tasks";
import { Button, DialogShell, PopoverTextEditor } from "../ui";
import { DueDatePicker, TaskDatePicker } from "./TaskDatePicker";
import { RecurrencePicker } from "./RecurrencePicker";
import {
  TASK_DETAIL_DIVIDER_CLASS,
  TASK_DETAIL_EMPTY_TRIGGER_CLASS,
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

function useResolvedThemeFallback(): "light" | "dark" {
  try {
    return useTheme().resolvedTheme;
  } catch {
    return "light";
  }
}

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
    taskTagAppearances,
    updateTask,
    selectTask,
    selectView,
    today,
  } = useTasks();
  const resolvedTheme = useResolvedThemeFallback();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [link, setLink] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [tagSuggestionIndex, setTagSuggestionIndex] = useState(0);
  const [isTagInputFocused, setIsTagInputFocused] = useState(false);
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
  const [detectedTags, setDetectedTags] = useState<ReturnType<typeof detectTaskTagsFromTitle> | null>(null);
  const [ignoredTagSignature, setIgnoredTagSignature] = useState<string | null>(null);
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
    setTags([]);
    setTagDraft("");
    setTagSuggestionIndex(0);
    setIsTagInputFocused(false);
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
    setDetectedTags(null);
    setIgnoredTagSignature(null);
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
      const urlDetection = detectTaskUrlFromTitle(title);
      const titleAfterUrl =
        urlDetection && urlDetection.signature !== ignoredUrlSignature
          ? urlDetection.cleanedTitle
          : title;
      const tagDetection = detectTaskTagsFromTitle(titleAfterUrl);
      const titleForDate =
        tagDetection.tags.length > 0 && tagDetection.tags.join(",") !== ignoredTagSignature
          ? tagDetection.cleanedTitle
          : titleAfterUrl;
      const nextDetection = detectTaskDateFromTitle(titleForDate, today);
      if (!nextDetection || nextDetection.signature === ignoredDetectionSignature) {
        setDetectedDate(null);
        return;
      }

      setDetectedDate(nextDetection);
    }, CAPTURE_DATE_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [ignoredDetectionSignature, ignoredTagSignature, ignoredUrlSignature, open, title, today]);

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

  useEffect(() => {
    if (!open || !title.trim()) {
      setDetectedTags(null);
      return;
    }

    const nextDetection = detectTaskTagsFromTitle(title);
    const signature = nextDetection.tags.join(",");
    if (nextDetection.tags.length === 0 || signature === ignoredTagSignature) {
      setDetectedTags(null);
      return;
    }

    setDetectedTags(nextDetection);
  }, [ignoredTagSignature, open, title]);

  const activeDetectedTags = useMemo(() => {
    if (!detectedTags) return [];
    return detectedTags.tags.filter((tag) => !tags.includes(tag));
  }, [detectedTags, tags]);
  const visibleTags = useMemo(() => [...tags, ...activeDetectedTags], [activeDetectedTags, tags]);

  const knownTagSuggestions = useMemo(() => {
    const counts = new Map<string, number>();
    const selectedTagSet = new Set(visibleTags);
    const query = normalizeTaskTag(tagDraft) ?? "";

    for (const task of tasks) {
      for (const tag of task.tags ?? []) {
        const normalizedTag = normalizeTaskTag(tag);
        if (!normalizedTag || selectedTagSet.has(normalizedTag)) continue;
        if (query && !normalizedTag.includes(query)) continue;
        counts.set(normalizedTag, (counts.get(normalizedTag) ?? 0) + 1);
      }
    }

    return [...counts.entries()]
      .sort(([leftTag, leftCount], [rightTag, rightCount]) => {
        if (leftCount !== rightCount) return rightCount - leftCount;
        return leftTag.localeCompare(rightTag);
      })
      .slice(0, 6)
      .map(([tag]) => tag);
  }, [tagDraft, tasks, visibleTags]);

  useEffect(() => {
    setTagSuggestionIndex(0);
  }, [knownTagSuggestions]);

  const saveTags = useCallback((nextTags: string[]) => {
    const normalizedTags = nextTags
      .map((tag) => normalizeTaskTag(tag))
      .filter((tag): tag is string => Boolean(tag));
    setTags([...new Set(normalizedTags)]);
  }, []);

  const commitTagDraft = useCallback(() => {
    const normalizedTag = normalizeTaskTag(tagDraft);
    if (!normalizedTag) {
      setTagDraft("");
      return;
    }
    saveTags([...tags, normalizedTag]);
    setTagDraft("");
  }, [saveTags, tagDraft, tags]);

  const applyTagSuggestion = useCallback((tag: string) => {
    saveTags([...tags, tag]);
    setTagDraft("");
    setTagSuggestionIndex(0);
  }, [saveTags, tags]);

  const removeTag = useCallback((tag: string) => {
    if (tags.includes(tag)) {
      setTags(tags.filter((existingTag) => existingTag !== tag));
      return;
    }

    if (detectedTags?.tags.includes(tag)) {
      setIgnoredTagSignature(detectedTags.tags.join(","));
      setDetectedTags(null);
    }
  }, [detectedTags, tags]);

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
    const nextTagDetection = detectTaskTagsFromTitle(titleAfterUrl);
    const detectedTagSignature = nextTagDetection.tags.join(",");
    const activeTagDetection =
      nextTagDetection.tags.length > 0 &&
      detectedTagSignature !== ignoredTagSignature
        ? nextTagDetection
        : null;
    const titleAfterTags = activeTagDetection ? activeTagDetection.cleanedTitle : titleAfterUrl;
    // link is already correct — auto-populated by the detection effect or typed manually.

    const nextDetection = detectTaskDateFromTitle(titleAfterTags, today);
    const activeDetection =
      nextDetection && nextDetection.signature !== ignoredDetectionSignature
        ? nextDetection
        : null;
    const trimmedTitle = (activeDetection?.cleanedTitle ?? titleAfterTags).trim();
    if (!trimmedTitle || isSaving) {
      return;
    }

    const effectiveActionDate =
      manualScheduleBucket ? "" : manualActionDate || activeDetection?.localDate || "";
    const effectiveTags = [
      ...new Set([
        ...tags,
        ...(activeTagDetection?.tags ?? []),
      ]),
    ];

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
        ...(effectiveTags.length ? { tags: effectiveTags } : {}),
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
        effectiveTags.length > 0 ||
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
    ignoredTagSignature,
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
    tags,
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

    if (detectedTags) {
      for (const match of detectedTags.matches) {
        ranges.push({ start: match.start, end: match.end });
      }
    }

    return ranges.sort((a, b) => a.start - b.start);
  }, [showDetectedDateChip, detectedDate, detectedTags, detectedUrl, title]);
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
      panelClassName="max-w-md"
    >
      <div className="relative w-full px-4 py-4">
        <button
          type="button"
          onClick={handleClose}
          className="ui-focus-ring absolute right-4 top-4 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--ui-radius-md)] text-text-muted transition-colors hover:bg-bg-muted hover:text-text"
          aria-label="Close task capture"
        >
          <X className="h-4.5 w-4.5 stroke-[1.5]" />
        </button>
        <div className="flex w-full flex-col gap-4">
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
                <CalendarDays className="h-3.5 w-3.5 shrink-0 stroke-[1.8]" />
                <span>Action: {detectedDate?.label}</span>
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
              showHeader={false}
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
                  <button
                    type="button"
                    onClick={openEditor}
                    className={TASK_DETAIL_EMPTY_TRIGGER_CLASS}
                  >
                    <Clock3 className="h-4 w-4 stroke-[1.7] transition-colors group-hover:text-text" />
                    <span>Waiting</span>
                  </button>
                )
              }
            />
          </div>

          <div className={cn("w-full", TASK_DETAIL_SECTION_CLASS)}>
            <div className={TASK_DETAIL_LABEL_CLASS}>Tags</div>
            <div className="relative">
              <div
                className="flex min-h-[calc(var(--ui-control-height-compact)+0.5rem)] flex-wrap items-center gap-1.5 bg-transparent py-1"
                onMouseDown={(event) => {
                  if (event.target === event.currentTarget) {
                    event.preventDefault();
                    event.currentTarget.querySelector("input")?.focus();
                  }
                }}
              >
                {visibleTags.map((tag) => {
                  const appearance = getFolderAppearance(taskTagAppearances, tag);
                  const textColor = resolveFolderAppearanceTextColor(appearance, resolvedTheme);
                  const iconColor = resolveFolderAppearanceIconColor(appearance, resolvedTheme);
                  const isDetected = activeDetectedTags.includes(tag);
                  return (
                    <span
                      key={tag}
                      className={cn(
                        "inline-flex h-[var(--ui-control-height-compact)] max-w-full items-center gap-1.5 rounded-[var(--ui-radius-sm)] px-2 text-xs font-medium",
                        isDetected ? "bg-accent/10 text-text" : "bg-bg-muted text-text",
                      )}
                      style={textColor ? { color: textColor } : undefined}
                    >
                      <FolderGlyph
                        icon={appearance?.icon ?? { kind: "lucide", name: "hash" }}
                        className="h-3.5 w-3.5 shrink-0 stroke-[1.8] text-text-muted"
                        style={iconColor ? { color: iconColor } : undefined}
                      />
                      <span className="min-w-0 truncate">{tag}</span>
                      <button
                        type="button"
                        aria-label={isDetected ? `Dismiss detected tag ${tag}` : `Remove tag ${tag}`}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          removeTag(tag);
                          titleInputRef.current?.focus();
                        }}
                        className="ui-focus-ring -mr-0.5 inline-flex h-4 w-4 items-center justify-center rounded-[var(--ui-radius-sm)] text-text-muted transition-colors hover:bg-bg hover:text-text"
                      >
                        <X className="h-3 w-3 stroke-[2]" />
                      </button>
                    </span>
                  );
                })}
                <input
                  type="text"
                  value={tagDraft}
                  placeholder={visibleTags.length > 0 ? "Add tag…" : "Add tags…"}
                  onFocus={() => setIsTagInputFocused(true)}
                  onChange={(event) => setTagDraft(event.target.value)}
                  onBlur={() => {
                    setIsTagInputFocused(false);
                    commitTagDraft();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                      if (knownTagSuggestions.length === 0) return;
                      event.preventDefault();
                      setTagSuggestionIndex((current) =>
                        (current + 1) % knownTagSuggestions.length,
                      );
                      return;
                    }

                    if (event.key === "ArrowUp") {
                      if (knownTagSuggestions.length === 0) return;
                      event.preventDefault();
                      setTagSuggestionIndex((current) =>
                        current <= 0 ? knownTagSuggestions.length - 1 : current - 1,
                      );
                      return;
                    }

                    if (event.key === "Enter") {
                      event.preventDefault();
                      const suggestion = knownTagSuggestions[tagSuggestionIndex];
                      if (suggestion) {
                        applyTagSuggestion(suggestion);
                      } else {
                        commitTagDraft();
                      }
                      return;
                    }

                    if (event.key === "," || event.key === " ") {
                      event.preventDefault();
                      commitTagDraft();
                      return;
                    }

                    if (event.key === "Backspace" && !tagDraft && tags.length > 0) {
                      removeTag(tags[tags.length - 1]);
                    }
                  }}
                  className="h-[var(--ui-control-height-compact)] min-w-24 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-text-muted/40"
                />
              </div>
              {isTagInputFocused && knownTagSuggestions.length > 0 ? (
                <div className="absolute left-0 top-full z-40 mt-1.5 min-w-48 max-w-full rounded-[var(--ui-radius-md)] border border-border bg-bg-secondary p-1 shadow-[var(--ui-shadow-menu)]">
                  {knownTagSuggestions.map((tag, index) => {
                    const appearance = getFolderAppearance(taskTagAppearances, tag);
                    const textColor = resolveFolderAppearanceTextColor(appearance, resolvedTheme);
                    const iconColor = resolveFolderAppearanceIconColor(appearance, resolvedTheme);
                    const isActive = index === tagSuggestionIndex;

                    return (
                      <button
                        key={tag}
                        type="button"
                        onMouseEnter={() => setTagSuggestionIndex(index)}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => applyTagSuggestion(tag)}
                        className={cn(
                          "ui-focus-ring flex w-full items-center gap-2 rounded-[var(--ui-radius-md)] px-2.5 py-1.5 text-left text-sm text-text transition-colors",
                          isActive ? "bg-bg-muted" : "hover:bg-bg-muted",
                        )}
                        style={textColor ? { color: textColor } : undefined}
                      >
                        <FolderGlyph
                          icon={appearance?.icon ?? { kind: "lucide", name: "hash" }}
                          className="h-4 w-4 shrink-0 stroke-[1.7] text-text-muted"
                          style={iconColor ? { color: iconColor } : undefined}
                        />
                        <span className="min-w-0 truncate">{tag}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>

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

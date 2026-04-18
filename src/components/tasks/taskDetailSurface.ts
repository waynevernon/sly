// Keep quick task capture and the full task detail panel visually aligned.
// When one surface changes, update the shared tokens here so the other follows.
export const TASK_DETAIL_LABEL_CLASS = "text-[11px] font-medium text-text-muted";

export const TASK_DETAIL_SECTION_CLASS = "space-y-1.5";

export const TASK_DETAIL_DIVIDER_CLASS = "border-t border-border/40";

export const TASK_DETAIL_FIELD_INPUT_CLASS =
  "w-full bg-transparent text-sm leading-relaxed text-text outline-none placeholder:text-text-muted/40";

export const TASK_DETAIL_FILLED_TRIGGER_CLASS =
  "ui-focus-ring group inline-flex h-[var(--ui-control-height-standard)] max-w-[320px] items-center gap-2 rounded-[var(--ui-radius-md)] bg-bg-muted/70 px-3 text-sm text-text transition-colors hover:bg-bg-muted";

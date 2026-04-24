import { CheckSquare, FileText } from "lucide-react";
import { Footer } from "../layout/Footer";
import { TaskModeNavigationSection } from "./TasksSection";

interface TaskNavigationPaneProps {
  onOpenSettings?: () => void;
  onShowNotes?: () => void;
  onShowTasks?: () => void;
}

export function TaskNavigationPane({
  onOpenSettings,
  onShowNotes,
  onShowTasks,
}: TaskNavigationPaneProps) {
  return (
    <div className="ui-pane-shell flex h-full flex-col select-none bg-bg-secondary">
      <div className="ui-pane-drag-region" data-tauri-drag-region></div>
      <div className="ui-pane-header border-border/80">
        {onShowNotes && onShowTasks ? (
          <div className="flex min-w-0 items-center gap-1 -ml-2">
            <button
              type="button"
              aria-pressed={false}
              onClick={onShowNotes}
              title="Notes"
              className="ui-focus-ring flex items-center h-[var(--ui-control-height-compact)] px-2 rounded-[var(--ui-radius-md)] text-text-muted transition-colors hover:bg-bg-muted hover:text-text outline-none"
            >
              <FileText className="h-4 w-4 shrink-0 stroke-[1.7]" />
            </button>
            <button
              type="button"
              aria-pressed={true}
              onClick={onShowTasks}
              className="ui-focus-ring ui-pane-mode-active flex shrink-0 items-center gap-1.5 rounded-[var(--ui-radius-md)] font-medium text-base text-text bg-bg-muted px-2 h-[var(--ui-control-height-compact)] outline-none"
            >
              <CheckSquare className="h-4 w-4 shrink-0 stroke-[1.7]" />
              <span className="ui-pane-mode-label">Tasks</span>
            </button>
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <CheckSquare className="h-4.5 w-4.5 shrink-0 text-text-muted/80 stroke-[1.7]" />
            <div className="min-w-0 truncate font-medium text-base text-text">Tasks</div>
          </div>
        )}
      </div>

      <div className="ui-scrollbar-overlay flex-1 overflow-y-auto py-2.5">
        <TaskModeNavigationSection />
      </div>

      <Footer onOpenSettings={onOpenSettings} />
    </div>
  );
}

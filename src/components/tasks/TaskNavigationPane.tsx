import { CheckSquare } from "lucide-react";
import { Footer } from "../layout/Footer";
import { TaskModeNavigationSection } from "./TasksSection";

interface TaskNavigationPaneProps {
  onOpenSettings?: () => void;
}

export function TaskNavigationPane({
  onOpenSettings,
}: TaskNavigationPaneProps) {
  return (
    <div className="flex h-full flex-col select-none bg-bg-secondary">
      <div className="ui-pane-drag-region" data-tauri-drag-region></div>
      <div className="ui-pane-header border-border/80">
        <div className="flex items-center gap-1.5 min-w-0">
          <CheckSquare className="h-4.5 w-4.5 shrink-0 text-text-muted/80 stroke-[1.7]" />
          <div className="font-medium text-base text-text">Tasks</div>
        </div>
      </div>

      <div className="ui-scrollbar-overlay flex-1 overflow-y-auto py-2.5">
        <TaskModeNavigationSection />
      </div>

      <Footer onOpenSettings={onOpenSettings} />
    </div>
  );
}

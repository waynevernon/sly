import { CheckSquare, Inbox, CalendarClock, HelpCircle, Clock, BookOpen } from "lucide-react";
import { cn } from "../../lib/utils";
import { TASK_VIEW_ORDER, TASK_VIEW_LABELS } from "../../lib/tasks";
import type { TaskView } from "../../types/tasks";
import { useTasks } from "../../context/TasksContext";

const VIEW_ICONS: Record<TaskView, React.FC<{ className?: string }>> = {
  inbox: ({ className }) => <Inbox className={className} />,
  today: ({ className }) => <CheckSquare className={className} />,
  upcoming: ({ className }) => <CalendarClock className={className} />,
  someday: ({ className }) => <HelpCircle className={className} />,
  waiting: ({ className }) => <Clock className={className} />,
  logbook: ({ className }) => <BookOpen className={className} />,
};

export function TasksSection() {
  const { selectedView, isTasksModeActive, selectView, buckets } = useTasks();

  return (
    <div className="px-2 pb-0.5">
      <div className="px-1 pb-1 pt-0.5">
        <span className="text-[0.7rem] font-medium uppercase tracking-widest text-text-muted/50 select-none">
          Tasks
        </span>
      </div>
      <div role="listbox" aria-label="Task horizons">
        {TASK_VIEW_ORDER.map((view) => {
          const Icon = VIEW_ICONS[view];
          const isSelected = isTasksModeActive && selectedView === view;
          const count = view !== "logbook" ? buckets[view].length : undefined;

          return (
            <div
              key={view}
              role="option"
              aria-selected={isSelected}
              onClick={() => selectView(view)}
              className={cn(
                "flex cursor-default items-center gap-1.5 rounded-md px-2 py-1.75 text-sm transition-colors duration-150",
                isSelected
                  ? "bg-bg-muted text-text"
                  : "text-text/80 hover:bg-bg-muted/60"
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0 stroke-[1.5]",
                  isSelected ? "text-text-muted" : "text-text-muted/70"
                )}
              />
              <span className="min-w-0 flex-1 truncate leading-none">
                {TASK_VIEW_LABELS[view]}
              </span>
              {count !== undefined && count > 0 && (
                <span className="text-xs tabular-nums text-text-muted/60">
                  {count}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

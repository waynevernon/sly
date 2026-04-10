import { CheckSquare, Inbox, CalendarClock, HelpCircle, Clock, BookOpen } from "lucide-react";
import { cn } from "../../lib/utils";
import { TASK_VIEW_ORDER, TASK_VIEW_LABELS } from "../../lib/tasks";
import type { TaskView } from "../../types/tasks";
import { useTasks } from "../../context/TasksContext";
import { CountBadge } from "../ui";

const VIEW_ICONS: Record<TaskView, React.FC<{ className?: string }>> = {
  inbox: ({ className }) => <Inbox className={className} />,
  today: ({ className }) => <CheckSquare className={className} />,
  upcoming: ({ className }) => <CalendarClock className={className} />,
  someday: ({ className }) => <HelpCircle className={className} />,
  waiting: ({ className }) => <Clock className={className} />,
  logbook: ({ className }) => <BookOpen className={className} />,
};

export function TasksSection() {
  const { selectedView, selectView, buckets } = useTasks();
  return (
    <TasksSectionInner
      selectedView={selectedView}
      selectView={selectView}
      buckets={buckets}
      showLabel
    />
  );
}

interface TasksSectionInnerProps {
  selectedView: ReturnType<typeof useTasks>["selectedView"];
  selectView: ReturnType<typeof useTasks>["selectView"];
  buckets: ReturnType<typeof useTasks>["buckets"];
  showLabel: boolean;
}

function TasksSectionInner({
  selectedView,
  selectView,
  buckets,
  showLabel,
}: TasksSectionInnerProps) {
  return (
    <section className="px-2 pb-0.5" aria-label="Tasks">
      {showLabel && (
        <div className="px-1.5 pb-1 pt-0.5">
          <span className="select-none text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted/55">
            Tasks
          </span>
        </div>
      )}
      <nav className="space-y-0.5" aria-label="Task horizons">
        {TASK_VIEW_ORDER.map((view) => {
          const Icon = VIEW_ICONS[view];
          const isSelected = selectedView === view;
          const count = view !== "logbook" ? buckets[view].length : undefined;

          return (
            <button
              key={view}
              type="button"
              aria-pressed={isSelected}
              onClick={() => selectView(view)}
              className={cn(
                "ui-focus-ring flex w-full items-center gap-2 rounded-md px-2.5 py-1.75 text-sm transition-colors duration-150",
                isSelected
                  ? "bg-bg-muted text-text"
                  : "text-text/80 hover:bg-bg-muted/60 hover:text-text"
              )}
            >
              <Icon
                className={cn(
                  "h-4.25 w-4.25 shrink-0 stroke-[1.6]",
                  isSelected ? "text-text-muted" : "text-text-muted/70"
                )}
              />
              <span className="min-w-0 flex-1 truncate text-left leading-none">
                {TASK_VIEW_LABELS[view]}
              </span>
              {count !== undefined && count > 0 && (
                <span className="ui-count-badge-column">
                  <CountBadge
                    count={count}
                    layout="column"
                    emphasis={isSelected ? "active" : "inactive"}
                  />
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </section>
  );
}

export function TaskModeNavigationSection() {
  const { selectedView, selectView, buckets } = useTasks();
  return (
    <TasksSectionInner
      selectedView={selectedView}
      selectView={selectView}
      buckets={buckets}
      showLabel={false}
    />
  );
}

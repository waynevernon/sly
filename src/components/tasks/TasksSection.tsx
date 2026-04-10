import { Archive, CalendarClock, CheckCheck, CheckSquare, Clock3, Inbox, UserRound } from "lucide-react";
import { cn } from "../../lib/utils";
import { TASK_VIEW_ORDER, TASK_VIEW_LABELS } from "../../lib/tasks";
import type { TaskView } from "../../types/tasks";
import { useTasks } from "../../context/TasksContext";
import { CountBadge } from "../ui";

const VIEW_ICONS: Record<TaskView, React.FC<{ className?: string }>> = {
  inbox: ({ className }) => <Inbox className={className} />,
  today: ({ className }) => <CheckSquare className={className} />,
  upcoming: ({ className }) => <CalendarClock className={className} />,
  waiting: ({ className }) => <UserRound className={className} />,
  anytime: ({ className }) => <Clock3 className={className} />,
  someday: ({ className }) => <Archive className={className} />,
  completed: ({ className }) => <CheckCheck className={className} />,
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
    <section className="px-1.5 pb-1.5" aria-label="Tasks">
      {showLabel && (
        <div className="px-3 pb-1 pt-0.5">
          <span className="select-none text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted/55">
            Tasks
          </span>
        </div>
      )}
      <nav className="space-y-1" aria-label="Task horizons">
        {TASK_VIEW_ORDER.map((view) => {
          const Icon = VIEW_ICONS[view];
          const isSelected = selectedView === view;
          const count = buckets[view].length;

          return (
            <div key={view}>
              {view === "waiting" && (
                <div className="mx-3 my-1.5 border-t border-border/50" />
              )}
            <button
              type="button"
              aria-pressed={isSelected}
              onClick={() => selectView(view)}
              className={cn(
                "ui-focus-ring flex w-full items-center gap-3 rounded-md pl-3 pr-2 py-2 text-left transition-[background-color,box-shadow] duration-200",
                isSelected
                  ? "bg-bg-muted text-text"
                  : "text-text hover:bg-bg-muted/80"
              )}
            >
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <Icon
                  className={cn(
                    "h-4.25 w-4.25 shrink-0 stroke-[1.7]",
                    isSelected ? "text-text-muted" : "text-text-muted/80"
                  )}
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {TASK_VIEW_LABELS[view]}
                </span>
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
            </div>
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

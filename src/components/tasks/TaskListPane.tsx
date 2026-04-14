import { Fragment, useRef, useState, useCallback, useEffect, useMemo } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { createPortal } from "react-dom";
import {
  Archive,
  ArrowDownAZ,
  ArrowUpAZ,
  CalendarArrowDown,
  CalendarArrowUp,
  CalendarClock,
  CalendarDays,
  CheckCheck,
  CheckSquare,
  Clock3,
  ClockArrowDown,
  ClockArrowUp,
  GripVertical,
  Inbox,
  Plus,
  Star,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { SearchIcon, SearchOffIcon } from "../icons";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useDndMonitor } from "@dnd-kit/core";
import { useTasks } from "../../context/TasksContext";
import {
  actionAtToLocalDate,
  detectTaskDateFromTitle,
  localDateString,
  localDateToNormalizedActionAt,
  taskScheduleSelectionFromView,
  TASK_VIEW_LABELS,
} from "../../lib/tasks";
import {
  Button,
  IconButton,
  Input,
  PanelEmptyState,
  PopoverSurface,
  SearchClearButton,
  destructiveMenuItemClassName,
  menuItemClassName,
  menuSeparatorClassName,
} from "../ui";
import { SortMenuButton, type SortMenuItem } from "../layout/SortMenuButton";
import { TaskDatePickerPanel } from "./TaskDatePicker";
import { TaskRow } from "./TaskRow";
import { cn } from "../../lib/utils";
import { compareTasks, MANUAL_SORT_VIEWS, taskMatchesQuery } from "../../lib/tasks";
import type { TaskMetadata, TaskScheduleBucket, TaskSortMode, TaskView } from "../../types/tasks";

const EMPTY_MESSAGES: Record<string, { title: string; message: string }> = {
  inbox: {
    title: "Inbox is clear",
    message: "Capture tasks here. They'll stay until you schedule them.",
  },
  today: {
    title: "Nothing for today",
    message: "Tasks with today's date or earlier show up here.",
  },
  upcoming: {
    title: "Nothing scheduled",
    message: "Set an action date on a task to plan ahead.",
  },
  anytime: {
    title: "Nothing queued anytime",
    message: "Use Anytime for tasks you want to keep active without picking a day.",
  },
  waiting: {
    title: "Nothing is waiting",
    message: "Tasks you are waiting on show up here so blocked work is easy to review.",
  },
  someday: {
    title: "Nothing in someday",
    message: "Park colder ideas here so they stay visible but out of the way.",
  },
  completed: {
    title: "No completed tasks",
    message: "Finished tasks appear here.",
  },
  starred: {
    title: "No starred tasks",
    message: "Star tasks to surface them here.",
  },
};

const EMPTY_STATE_ICONS: Record<TaskView, React.FC<{ className?: string }>> = {
  inbox: Inbox,
  today: CheckSquare,
  upcoming: CalendarClock,
  waiting: UserRound,
  anytime: Clock3,
  someday: Archive,
  completed: CheckCheck,
  starred: Star,
};

const HEADER_ICONS: Record<TaskView, React.FC<{ className?: string }>> = {
  inbox: Inbox,
  today: CheckSquare,
  upcoming: CalendarClock,
  waiting: UserRound,
  anytime: Clock3,
  someday: Archive,
  completed: CheckCheck,
  starred: Star,
};

const BASE_TASK_SORT_ITEMS: SortMenuItem<TaskSortMode>[] = [
  {
    key: "action",
    label: "Action Date",
    isActive: (value) => value === "actionAsc" || value === "actionDesc",
    getNextValue: (value) =>
      value === "actionAsc" ? "actionDesc" : value === "actionDesc" ? "actionAsc" : "actionAsc",
    renderIcon: (value, isActive) => {
      const isAscending = value === "actionAsc";
      const Icon = isActive && isAscending ? CalendarArrowUp : CalendarArrowDown;
      return <Icon className="w-4 h-4 stroke-[1.6]" />;
    },
  },
  {
    key: "completed",
    label: "Completed Date",
    isActive: (value) => value === "completedAsc" || value === "completedDesc",
    getNextValue: (value) =>
      value === "completedAsc" ? "completedDesc" : value === "completedDesc" ? "completedAsc" : "completedDesc",
    renderIcon: (value, isActive) => {
      const isAscending = value === "completedAsc";
      const Icon = isActive && isAscending ? ClockArrowUp : ClockArrowDown;
      return <Icon className="w-4 h-4 stroke-[1.6]" />;
    },
  },
  {
    key: "created",
    label: "Created",
    isActive: (value) => value === "createdAsc" || value === "createdDesc",
    getNextValue: (value) =>
      value === "createdAsc" ? "createdDesc" : value === "createdDesc" ? "createdAsc" : "createdAsc",
    renderIcon: (value, isActive) => {
      const isAscending = value === "createdAsc";
      const Icon = isActive && isAscending ? CalendarArrowUp : CalendarArrowDown;
      return <Icon className="w-4 h-4 stroke-[1.6]" />;
    },
  },
  {
    key: "title",
    label: "Title",
    isActive: (value) => value === "titleAsc" || value === "titleDesc",
    getNextValue: (value) =>
      value === "titleAsc" ? "titleDesc" : value === "titleDesc" ? "titleAsc" : "titleAsc",
    renderIcon: (value, isActive) => {
      const isDescending = value === "titleDesc";
      const Icon = isActive && isDescending ? ArrowUpAZ : ArrowDownAZ;
      return <Icon className="w-4 h-4 stroke-[1.6]" />;
    },
  },
];

const MANUAL_SORT_ITEM: SortMenuItem<TaskSortMode> = {
  key: "manual",
  label: "Manual",
  isActive: (value) => value === "manual",
  getNextValue: () => "manual",
  renderIcon: () => <GripVertical className="w-4 h-4 stroke-[1.6]" />,
};

const CREATE_DATE_DEBOUNCE_MS = 350;

export function TaskListPane() {
  const {
    tasks: allTasks,
    buckets,
    selectedView,
    selectedTaskId,
    selectedTaskIds,
    today,
    isLoading,
    taskSortMode,
    setTaskSortMode,
    taskViewOrders,
    setTaskViewOrder,
    selectTask,
    toggleTaskSelection,
    selectTaskRange,
    clearTaskSelection,
    setCompleted,
    createTask,
    updateTask,
    deleteTask,
  } = useTasks();

  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [detectedDate, setDetectedDate] = useState<ReturnType<typeof detectTaskDateFromTitle>>(null);
  const [ignoredDetectionSignature, setIgnoredDetectionSignature] = useState<string | null>(null);
  const [pendingSelectionTaskId, setPendingSelectionTaskId] = useState<string | null>(null);
  const [rescheduleTaskIds, setRescheduleTaskIds] = useState<string[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Search state
  const [searchOpen, setSearchOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchDebounceRef = useRef<number | null>(null);

  const isSearching = searchQuery.trim().length > 0;

  const viewOrder = taskViewOrders[selectedView];
  const tasks = [...(buckets[selectedView] ?? [])].sort((a, b) =>
    compareTasks(a, b, selectedView, taskSortMode, viewOrder),
  );
  const taskMap = useMemo(
    () => new Map(tasks.map((task) => [task.id, task] as const)),
    [tasks],
  );
  const selectedTaskIdSet = useMemo(
    () => new Set(selectedTaskIds),
    [selectedTaskIds],
  );
  const selectedTasks = useMemo(
    () =>
      selectedTaskIds
        .map((id) => taskMap.get(id))
        .filter((task): task is TaskMetadata => Boolean(task)),
    [selectedTaskIds, taskMap],
  );
  const empty = EMPTY_MESSAGES[selectedView] ?? {
    title: "Nothing here",
    message: "",
  };
  const EmptyStateIcon = EMPTY_STATE_ICONS[selectedView];
  const HeaderIcon = HEADER_ICONS[selectedView];
  const selectionCount = selectedTaskIds.length;
  const hasBatchSelection = selectionCount > 1;
  const canInlineCreate = selectedView !== "completed" && selectedView !== "waiting" && selectedView !== "starred";
  const inlineTitleHighlight = useMemo(() => {
    if (!detectedDate) return null;
    const lower = newTitle.toLowerCase();
    const matchedLower = detectedDate.matchedText.toLowerCase();
    const start = lower.indexOf(matchedLower);
    if (start === -1) return null;
    return { start, end: start + detectedDate.matchedText.length };
  }, [detectedDate, newTitle]);

  const focusCreateInput = useCallback(() => {
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const handleStartCreate = useCallback(() => {
    setIsCreating(true);
    setNewTitle("");
    setDetectedDate(null);
    setIgnoredDetectionSignature(null);
    focusCreateInput();
  }, [focusCreateInput]);

  useEffect(() => {
    if (!isCreating) {
      setDetectedDate(null);
      return;
    }

    if (!newTitle.trim()) {
      setDetectedDate(null);
      return;
    }

    const timer = setTimeout(() => {
      const nextDetection = detectTaskDateFromTitle(newTitle, today);
      if (!nextDetection || nextDetection.signature === ignoredDetectionSignature) {
        setDetectedDate(null);
        return;
      }
      setDetectedDate(nextDetection);
    }, CREATE_DATE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [ignoredDetectionSignature, isCreating, newTitle, today]);

  useEffect(() => {
    if (!pendingSelectionTaskId) {
      return;
    }

    if (!tasks.some((task) => task.id === pendingSelectionTaskId)) {
      return;
    }

    selectTask(pendingSelectionTaskId);
    setPendingSelectionTaskId(null);
  }, [pendingSelectionTaskId, selectTask, tasks]);

  const handleCommitCreate = useCallback(async (options?: {
    continueCapturing?: boolean;
  }) => {
    const continueCapturing = options?.continueCapturing ?? false;
    const nextDetection = detectTaskDateFromTitle(newTitle, today);
    const activeDetection =
      nextDetection && nextDetection.signature !== ignoredDetectionSignature
        ? nextDetection
        : null;
    const title = (activeDetection?.cleanedTitle ?? newTitle).trim();
    if (!title) {
      if (continueCapturing) {
        focusCreateInput();
      } else {
        setIsCreating(false);
      }
      return;
    }

    const task = await createTask(title);
    setNewTitle("");
    setDetectedDate(null);
    setIgnoredDetectionSignature(null);

    if (task && activeDetection && !task.actionAt) {
      await updateTask(task.id, {
        actionAt: activeDetection.actionAt,
        scheduleBucket: null,
      });
    } else if (task && !task.actionAt && !task.scheduleBucket) {
      const defaultSchedule = taskScheduleSelectionFromView(selectedView, today);
      if (defaultSchedule) {
        await updateTask(task.id, defaultSchedule);
      }
    }

    if (task) {
      setPendingSelectionTaskId(task.id);
    }

    if (continueCapturing) {
      setIsCreating(true);
      focusCreateInput();
      return;
    }

    setIsCreating(false);
  }, [
    createTask,
    focusCreateInput,
    ignoredDetectionSignature,
    newTitle,
    selectedView,
    today,
    updateTask,
  ]);

  const handleCreateKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void handleCommitCreate({ continueCapturing: true });
      } else if (event.key === "Escape") {
        setIsCreating(false);
        setNewTitle("");
        setDetectedDate(null);
        setIgnoredDetectionSignature(null);
      }
    },
    [handleCommitCreate],
  );

  const isManualSort = taskSortMode === "manual" && MANUAL_SORT_VIEWS.includes(selectedView);
  const groupedSections = getTaskSections(tasks, selectedView, today);

  // Search results: filter all tasks across every view, sort starred first then newest first
  const searchResults = useMemo(() => {
    if (!isSearching) return null;
    return allTasks
      .filter((task) => taskMatchesQuery(task, searchQuery))
      .sort((a, b) => {
        if (a.starred !== b.starred) return a.starred ? -1 : 1;
        return b.createdAt.localeCompare(a.createdAt);
      });
  }, [allTasks, isSearching, searchQuery]);

  const handleSearchChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setInputValue(value);
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = window.setTimeout(() => {
        setSearchQuery(value);
      }, 200);
    },
    [],
  );

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setInputValue("");
    setSearchQuery("");
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
  }, []);

  const toggleSearch = useCallback(() => {
    setSearchOpen((prev) => {
      if (prev) {
        setInputValue("");
        setSearchQuery("");
        if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      } else {
        requestAnimationFrame(() => searchInputRef.current?.focus());
      }
      return !prev;
    });
  }, []);

  const handleSearchKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (inputValue) {
        setInputValue("");
        setSearchQuery("");
      } else {
        closeSearch();
      }
    },
    [closeSearch, inputValue],
  );

  useEffect(() => {
    if (!searchOpen) return;
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }, [searchOpen]);

  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, []);

  // Handle same-section manual reorders via dnd-kit's monitor
  useDndMonitor({
    onDragEnd(event) {
      if (!isManualSort) return;
      const activeData = event.active.data.current;
      const overData = event.over?.data.current;
      if (activeData?.type !== "task") return;
      if (overData?.type !== "task") return;

      const activeTaskId = activeData.id as string;
      const overTaskId = overData.id as string;
      if (activeTaskId === overTaskId) return;

      // Only reorder if both tasks are in the same section
      const inSameSection = groupedSections.some(
        (s) =>
          s.tasks.some((t) => t.id === activeTaskId) &&
          s.tasks.some((t) => t.id === overTaskId),
      );
      if (!inSameSection) return;

      const currentOrder = viewOrder ?? tasks.map((t) => t.id);
      const activeIndex = currentOrder.indexOf(activeTaskId);
      const overIndex = currentOrder.indexOf(overTaskId);
      if (activeIndex === -1 || overIndex === -1) return;

      setTaskViewOrder(selectedView, arrayMove(currentOrder, activeIndex, overIndex));
    },
  });
  const rescheduleTasks = useMemo(
    () =>
      (rescheduleTaskIds ?? [])
        .map((id) => taskMap.get(id))
        .filter((task): task is TaskMetadata => Boolean(task)),
    [rescheduleTaskIds, taskMap],
  );

  const handleTaskSelect = useCallback(
    (
      id: string,
      event: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean },
    ) => {
      if (event.shiftKey) {
        selectTaskRange(id);
        return;
      }
      if (event.metaKey || event.ctrlKey) {
        toggleTaskSelection(id);
        return;
      }
      selectTask(id);
    },
    [selectTask, selectTaskRange, toggleTaskSelection],
  );

  const handleDeleteTasks = useCallback(
    async (ids: string[]) => {
      await Promise.all(ids.map((id) => deleteTask(id)));
    },
    [deleteTask],
  );

  const handleRescheduleTasks = useCallback(
    async (
      ids: string[],
      selection: {
        actionDate: string | null;
        scheduleBucket: TaskScheduleBucket | null;
      },
    ) => {
      await Promise.all(
        ids.map((id) =>
          updateTask(id, {
            actionAt: localDateToNormalizedActionAt(selection.actionDate),
            scheduleBucket: selection.scheduleBucket,
          }),
        ),
      );
    },
    [updateTask],
  );

  return (
    <div className="flex h-full flex-col select-none bg-bg">
      <div className="ui-pane-drag-region" data-tauri-drag-region></div>
      <div className="ui-pane-header border-border/80">
        <div className="flex min-w-0 items-center gap-1.5">
          {!isSearching && <HeaderIcon className="h-4.5 w-4.5 shrink-0 text-text-muted/80 stroke-[1.7]" />}
          <div className="min-w-0 truncate font-medium text-base text-text">
            {hasBatchSelection
              ? `${selectionCount} selected`
              : isSearching
                ? "Search Results"
                : TASK_VIEW_LABELS[selectedView]}
          </div>
        </div>
        {hasBatchSelection ? (
          <div className="ui-pane-header-actions ml-auto">
            <BulkReschedulePicker
              today={today}
              tasks={selectedTasks}
              triggerLabel="Reschedule"
              onReschedule={async (selection) => {
                await handleRescheduleTasks(selectedTaskIds, selection);
              }}
            />
            <IconButton
              type="button"
              variant="ghost"
              title="Delete Selected Tasks"
              onClick={() => void handleDeleteTasks(selectedTaskIds)}
            >
              <Trash2 className="h-4 w-4 stroke-[1.6]" />
            </IconButton>
            <IconButton
              type="button"
              title="Clear Selection"
              onClick={clearTaskSelection}
            >
              <X className="h-4 w-4 stroke-[1.6]" />
            </IconButton>
          </div>
        ) : (
          <div className="ui-pane-header-actions ml-auto">
            {!isSearching && (
              <SortMenuButton
                title="Sort Tasks"
                menuTitle={TASK_VIEW_LABELS[selectedView]}
                value={taskSortMode}
                items={(() => {
                  const base = selectedView === "completed"
                    ? BASE_TASK_SORT_ITEMS
                    : BASE_TASK_SORT_ITEMS.filter((item) => item.key !== "completed");
                  return MANUAL_SORT_VIEWS.includes(selectedView)
                    ? [...base, MANUAL_SORT_ITEM]
                    : base;
                })()}
                onChange={setTaskSortMode}
              />
            )}
            <IconButton
              type="button"
              title="Search Tasks"
              onClick={toggleSearch}
            >
              {searchOpen ? (
                <SearchOffIcon className="w-4.25 h-4.25 stroke-[1.5]" />
              ) : (
                <SearchIcon className="w-4.25 h-4.25 stroke-[1.5]" />
              )}
            </IconButton>
            {canInlineCreate && !isSearching && (
              <IconButton
                type="button"
                title="New Task"
                variant="ghost"
                onClick={handleStartCreate}
              >
                <Plus className="h-4 w-4 stroke-[1.8]" />
              </IconButton>
            )}
          </div>
        )}
      </div>

      <div className="ui-scrollbar-overlay flex-1 overflow-y-auto">
        {searchOpen && (
          <div className="sticky top-0 z-10 px-4 pt-2 pb-2 bg-bg border-b border-border animate-slide-down">
            <div className="relative">
              <Input
                ref={searchInputRef}
                type="text"
                value={inputValue}
                onChange={handleSearchChange}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search tasks…"
                className="pr-8 text-sm"
              />
              {inputValue && (
                <SearchClearButton onClick={() => { setInputValue(""); setSearchQuery(""); }} />
              )}
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex min-h-full">
            <PanelEmptyState
              title="Loading tasks"
              message="Reading your task list."
            />
          </div>
        ) : isSearching ? (
          searchResults!.length === 0 ? (
            <div className="flex min-h-full">
              <PanelEmptyState
                icon={<SearchIcon className="h-full w-full" />}
                title="No matching tasks"
                message="Try a different search term."
              />
            </div>
          ) : (
            <div
              role="listbox"
              aria-label="Search Results"
              aria-multiselectable={true}
              className="flex flex-col gap-1 px-1.5 pt-1.5 pb-1.5 outline-none"
            >
              {searchResults!.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  dragIds={
                    selectedTaskIds.length > 1 && selectedTaskIdSet.has(task.id)
                      ? selectedTaskIds
                      : [task.id]
                  }
                  view={task.completedAt ? "completed" : "upcoming"}
                  today={today}
                  selectionState={
                    selectedTaskId === task.id
                      ? "active"
                      : selectedTaskIdSet.has(task.id)
                        ? "selected"
                        : "none"
                  }
                  onSelect={(event) => handleTaskSelect(task.id, event)}
                  onContextMenuOpen={() => {
                    if (!(hasBatchSelection && selectedTaskIdSet.has(task.id))) {
                      selectTask(task.id);
                    }
                  }}
                  onToggleComplete={() => void setCompleted(task.id, !task.completedAt)}
                  onToggleStar={() => void updateTask(task.id, { starred: !task.starred })}
                  onRename={(title) => void updateTask(task.id, { title })}
                  contextMenu={
                    <>
                      <ContextMenu.Item
                        className={menuItemClassName}
                        onSelect={() => setRescheduleTaskIds([task.id])}
                      >
                        <CalendarDays className="h-4 w-4 stroke-[1.6]" />
                        Reschedule…
                      </ContextMenu.Item>
                      <ContextMenu.Separator className={menuSeparatorClassName} />
                      <ContextMenu.Item
                        className={destructiveMenuItemClassName}
                        onSelect={() => void handleDeleteTasks([task.id])}
                      >
                        <Trash2 className="h-4 w-4 stroke-[1.6]" />
                        Delete
                      </ContextMenu.Item>
                    </>
                  }
                />
              ))}
            </div>
          )
        ) : tasks.length === 0 && !isCreating ? (
          <div className="flex min-h-full">
            <PanelEmptyState
              icon={<EmptyStateIcon />}
              title={empty.title}
              message={empty.message}
              action={canInlineCreate ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={handleStartCreate}
                >
                  New Task
                </Button>
              ) : undefined}
            />
          </div>
        ) : (
          <div
            role="listbox"
            aria-label={TASK_VIEW_LABELS[selectedView]}
            aria-multiselectable={true}
            className="flex flex-col gap-1 px-1.5 pt-2.5 pb-1.5 outline-none"
          >
            {groupedSections.map((section) => {
              const sectionItems = section.tasks.map((t) => `task:${t.id}`);
              const sectionContent = (
              <div className="flex flex-col gap-1">
                {section.label ? (
                  <div className="flex items-center justify-between gap-2 px-2.5 pt-1 pb-0.5">
                    <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted/55">
                      {section.label}
                    </div>
                    {selectedView === "today" && section.id === "overdue" ? (
                      <BulkReschedulePicker
                        today={today}
                        tasks={section.tasks}
                        onReschedule={async (selection) => {
                          await Promise.all(
                            section.tasks.map((task) =>
                              updateTask(task.id, {
                                actionAt: localDateToNormalizedActionAt(selection.actionDate),
                                scheduleBucket: selection.scheduleBucket,
                              }),
                            ),
                          );
                        }}
                      />
                    ) : null}
                  </div>
                ) : null}
                {section.tasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    dragIds={
                      selectedTaskIds.length > 1 && selectedTaskIdSet.has(task.id)
                        ? selectedTaskIds
                        : [task.id]
                    }
                    view={selectedView}
                    today={today}
                    selectionState={
                      selectedTaskId === task.id
                        ? "active"
                        : selectedTaskIdSet.has(task.id)
                          ? "selected"
                          : "none"
                    }
                    onSelect={(event) => handleTaskSelect(task.id, event)}
                    onContextMenuOpen={() => {
                      if (!(hasBatchSelection && selectedTaskIdSet.has(task.id))) {
                        selectTask(task.id);
                      }
                    }}
                    onToggleComplete={() => void setCompleted(task.id, !task.completedAt)}
                    onToggleStar={() => void updateTask(task.id, { starred: !task.starred })}
                    onRename={(title) => void updateTask(task.id, { title })}
                    contextMenu={
                      hasBatchSelection && selectedTaskIdSet.has(task.id) ? (
                        <>
                          <ContextMenu.Item
                            className={menuItemClassName}
                            onSelect={() => {
                              setRescheduleTaskIds(selectedTaskIds);
                            }}
                          >
                            <CalendarDays className="h-4 w-4 stroke-[1.6]" />
                            Reschedule Selected Tasks…
                          </ContextMenu.Item>
                          <ContextMenu.Separator className={menuSeparatorClassName} />
                          <ContextMenu.Item
                            className={destructiveMenuItemClassName}
                            onSelect={() => void handleDeleteTasks(selectedTaskIds)}
                          >
                            <Trash2 className="h-4 w-4 stroke-[1.6]" />
                            Delete Selected Tasks
                          </ContextMenu.Item>
                          <ContextMenu.Item
                            className={menuItemClassName}
                            onSelect={clearTaskSelection}
                          >
                            <X className="h-4 w-4 stroke-[1.6]" />
                            Clear Selection
                          </ContextMenu.Item>
                        </>
                      ) : (
                        <>
                          <ContextMenu.Item
                            className={menuItemClassName}
                            onSelect={() => {
                              setRescheduleTaskIds([task.id]);
                            }}
                          >
                            <CalendarDays className="h-4 w-4 stroke-[1.6]" />
                            Reschedule…
                          </ContextMenu.Item>
                          <ContextMenu.Separator className={menuSeparatorClassName} />
                          <ContextMenu.Item
                            className={destructiveMenuItemClassName}
                            onSelect={() => void handleDeleteTasks([task.id])}
                          >
                            <Trash2 className="h-4 w-4 stroke-[1.6]" />
                            Delete
                          </ContextMenu.Item>
                        </>
                      )
                    }
                  />
                ))}
              </div>
              );
              return isManualSort ? (
                <SortableContext
                  key={section.id}
                  items={sectionItems}
                  strategy={verticalListSortingStrategy}
                >
                  {sectionContent}
                </SortableContext>
              ) : <Fragment key={section.id}>{sectionContent}</Fragment>;
            })}

            {isCreating && (
              <div className="rounded-[var(--ui-radius-md)] bg-bg-muted/50 pl-2.5 pr-2.5 py-1.75">
                <div className="flex items-center gap-2.5">
                  <div className="mt-0.5 h-4 w-4 shrink-0 rounded-[var(--ui-radius-sm)] border border-border bg-bg" />
                  <div className="relative min-w-0 flex-1">
                    {inlineTitleHighlight && (
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 flex items-center overflow-hidden whitespace-pre text-sm font-medium leading-normal text-transparent"
                      >
                        {newTitle.slice(0, inlineTitleHighlight.start)}
                        <span className="rounded-sm bg-accent/12">
                          {newTitle.slice(inlineTitleHighlight.start, inlineTitleHighlight.end)}
                        </span>
                        {newTitle.slice(inlineTitleHighlight.end)}
                      </div>
                    )}
                    <input
                      ref={inputRef}
                      type="text"
                      value={newTitle}
                      placeholder="Task name"
                      onChange={(event) => setNewTitle(event.target.value)}
                      onBlur={() => void handleCommitCreate()}
                      onKeyDown={handleCreateKeyDown}
                      className={cn(
                        "relative min-w-0 w-full bg-transparent text-sm font-medium text-text outline-none placeholder:text-text-muted/50",
                      )}
                    />
                  </div>
                </div>

                {detectedDate ? (
                  <div className="mt-2 flex items-center pl-6.5">
                    <div className="inline-flex h-[var(--ui-control-height-compact)] items-center gap-1.5 rounded-[var(--ui-radius-md)] bg-bg px-2.5 text-xs font-medium text-text-muted">
                      <CalendarClock className="h-3.5 w-3.5 shrink-0 stroke-[1.8]" />
                      <span>Date: {detectedDate.label}</span>
                      <button
                        type="button"
                        aria-label="Dismiss detected date"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          setIgnoredDetectionSignature(detectedDate.signature);
                          setDetectedDate(null);
                          inputRef.current?.focus();
                        }}
                        className="ui-focus-ring inline-flex h-4 w-4 items-center justify-center rounded-[var(--ui-radius-sm)] text-text-muted transition-colors hover:bg-bg-muted hover:text-text"
                      >
                        <X className="h-3 w-3 stroke-[2]" />
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        )}
      </div>
      {rescheduleTaskIds && rescheduleTasks.length > 0 ? (
        <TaskBulkRescheduleDialog
          today={today}
          tasks={rescheduleTasks}
          onClose={() => setRescheduleTaskIds(null)}
          onReschedule={async (selection) => {
            await handleRescheduleTasks(rescheduleTaskIds, selection);
            setRescheduleTaskIds(null);
          }}
        />
      ) : null}
    </div>
  );
}

function getTaskSections(
  tasks: ReturnType<typeof useTasks>["tasks"],
  view: TaskView,
  today: string,
): Array<{ id: string; label: string | null; tasks: ReturnType<typeof useTasks>["tasks"] }> {
  if (view === "today") {
    const overdue: typeof tasks = [];
    const todayItems: typeof tasks = [];

    for (const task of tasks) {
      const actionDate = actionAtToLocalDate(task.actionAt);
      if (actionDate && actionDate < today) {
        overdue.push(task);
      } else {
        todayItems.push(task);
      }
    }

    return [
      { id: "overdue", label: overdue.length > 0 ? "Overdue" : null, tasks: overdue },
      { id: "today", label: overdue.length > 0 ? "Today" : null, tasks: todayItems },
    ].filter((section) => section.tasks.length > 0);
  }

  if (view === "upcoming") {
    const tomorrow = offsetLocalDate(today, 1);
    const weekEnd = endOfWeek(today);
    const tomorrowItems: typeof tasks = [];
    const thisWeekItems: typeof tasks = [];
    const laterItems: typeof tasks = [];

    for (const task of tasks) {
      const actionDate = actionAtToLocalDate(task.actionAt);
      if (!actionDate) {
        laterItems.push(task);
      } else if (actionDate === tomorrow) {
        tomorrowItems.push(task);
      } else if (actionDate <= weekEnd) {
        thisWeekItems.push(task);
      } else {
        laterItems.push(task);
      }
    }

    return [
      { id: "tomorrow", label: "Tomorrow", tasks: tomorrowItems },
      { id: "this-week", label: "This Week", tasks: thisWeekItems },
      { id: "later", label: "Later", tasks: laterItems },
    ].filter((section) => section.tasks.length > 0);
  }

  if (view === "completed") {
    const yesterday = offsetLocalDate(today, -1);
    const weekStart = startOfWeek(today);
    const todayItems: typeof tasks = [];
    const yesterdayItems: typeof tasks = [];
    const thisWeekItems: typeof tasks = [];
    const earlierItems: typeof tasks = [];

    for (const task of tasks) {
      const completedDate = actionAtToLocalDate(task.completedAt);
      if (!completedDate) {
        earlierItems.push(task);
      } else if (completedDate === today) {
        todayItems.push(task);
      } else if (completedDate === yesterday) {
        yesterdayItems.push(task);
      } else if (completedDate >= weekStart) {
        thisWeekItems.push(task);
      } else {
        earlierItems.push(task);
      }
    }

    return [
      { id: "completed-today", label: "Today", tasks: todayItems },
      { id: "completed-yesterday", label: "Yesterday", tasks: yesterdayItems },
      { id: "completed-this-week", label: "This Week", tasks: thisWeekItems },
      { id: "completed-earlier", label: "Earlier", tasks: earlierItems },
    ].filter((section) => section.tasks.length > 0);
  }

  if (view === "waiting") {
    const overdue: typeof tasks = [];
    const todayItems: typeof tasks = [];
    const upcomingItems: typeof tasks = [];
    const anytimeItems: typeof tasks = [];
    const somedayItems: typeof tasks = [];
    const unscheduledItems: typeof tasks = [];

    for (const task of tasks) {
      const actionDate = actionAtToLocalDate(task.actionAt);
      if (actionDate) {
        if (actionDate < today) {
          overdue.push(task);
        } else if (actionDate === today) {
          todayItems.push(task);
        } else {
          upcomingItems.push(task);
        }
        continue;
      }

      if (task.scheduleBucket === "anytime") {
        anytimeItems.push(task);
      } else if (task.scheduleBucket === "someday") {
        somedayItems.push(task);
      } else {
        unscheduledItems.push(task);
      }
    }

    return [
      { id: "waiting-overdue", label: "Overdue", tasks: overdue },
      { id: "waiting-today", label: "Today", tasks: todayItems },
      { id: "waiting-upcoming", label: "Upcoming", tasks: upcomingItems },
      { id: "waiting-anytime", label: "Anytime", tasks: anytimeItems },
      { id: "waiting-someday", label: "Someday", tasks: somedayItems },
      { id: "waiting-unscheduled", label: "Unscheduled", tasks: unscheduledItems },
    ].filter((section) => section.tasks.length > 0);
  }

  return [{ id: "all", label: null, tasks }];
}

function BulkReschedulePicker({
  today,
  tasks,
  triggerLabel = "Reschedule",
  initiallyOpen = false,
  showTrigger = true,
  align = "right",
  onReschedule,
}: {
  today: string;
  tasks: ReturnType<typeof useTasks>["tasks"];
  triggerLabel?: string;
  initiallyOpen?: boolean;
  showTrigger?: boolean;
  align?: "left" | "right";
  onReschedule: (selection: {
    actionDate: string | null;
    scheduleBucket: TaskScheduleBucket | null;
  }) => Promise<void>;
}) {
  const [isOpen, setIsOpen] = useState(initiallyOpen);
  const [isSaving, setIsSaving] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState<{ left: number; top: number } | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setIsOpen(initiallyOpen);
  }, [initiallyOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const updatePosition = () => {
      if (!showTrigger) return;
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const width = 320;
      const margin = 8;
      const leftBase = align === "left" ? rect.left : rect.right - width;
      const left = Math.min(
        Math.max(margin, leftBase),
        Math.max(margin, window.innerWidth - width - margin),
      );
      const preferredTop = rect.bottom + 8;
      const estimatedHeight = 360;
      const top =
        preferredTop + estimatedHeight <= window.innerHeight
          ? preferredTop
          : Math.max(margin, rect.top - estimatedHeight - 8);
      setPopoverPosition({ left, top });
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !popoverRef.current?.contains(target) &&
        !triggerRef.current?.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    updatePosition();
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [align, isOpen, showTrigger]);

  const applySelection = useCallback(
    async (selection: { actionDate: string | null; scheduleBucket: TaskScheduleBucket | null }) => {
      if (isSaving) return;
      setIsSaving(true);
      try {
        await onReschedule(selection);
        setIsOpen(false);
      } finally {
        setIsSaving(false);
      }
    },
    [isSaving, onReschedule],
  );

  if (tasks.length === 0) {
    return null;
  }

  const panelContent = (
    <TaskDatePickerPanel
      today={today}
      actionDate={null}
      scheduleBucket={null}
      onSelect={(selection) => void applySelection(selection)}
    />
  );

  return (
    <div className="relative">
      {showTrigger ? (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setIsOpen((current) => !current)}
          className="ui-focus-ring inline-flex h-[var(--ui-control-height-compact)] items-center gap-1.5 rounded-[var(--ui-radius-md)] px-2 text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted transition-colors hover:bg-bg-muted hover:text-text"
        >
          <CalendarDays className="h-3.5 w-3.5 stroke-[1.8]" />
          <span>{isSaving ? "Rescheduling…" : triggerLabel}</span>
        </button>
      ) : null}

      {isOpen
        ? showTrigger && popoverPosition
          ? createPortal(
              <PopoverSurface
                ref={popoverRef}
                className="fixed z-[100] w-80 p-2.5"
                style={{ left: popoverPosition.left, top: popoverPosition.top }}
              >
                {panelContent}
              </PopoverSurface>,
              document.body,
            )
          : (
            <PopoverSurface
              ref={popoverRef}
              className="relative z-50 w-80 p-2.5"
            >
              {panelContent}
            </PopoverSurface>
          )
        : null}
    </div>
  );
}

function TaskBulkRescheduleDialog({
  today,
  tasks,
  onClose,
  onReschedule,
}: {
  today: string;
  tasks: ReturnType<typeof useTasks>["tasks"];
  onClose: () => void;
  onReschedule: (selection: {
    actionDate: string | null;
    scheduleBucket: TaskScheduleBucket | null;
  }) => Promise<void>;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  return (
      <div className="pointer-events-none fixed inset-0 z-50 flex items-start justify-center px-4 pt-24">
      <div ref={panelRef} className="pointer-events-auto">
        <BulkReschedulePicker
          today={today}
          tasks={tasks}
          initiallyOpen
          showTrigger={false}
          onReschedule={onReschedule}
        />
      </div>
    </div>
  );
}

function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    return new Date();
  }

  return new Date(year, month - 1, day);
}

function offsetLocalDate(date: string, days: number): string {
  const nextDate = parseLocalDate(date);
  nextDate.setDate(nextDate.getDate() + days);
  return localDateString(nextDate);
}

function endOfWeek(date: string): string {
  const currentDate = parseLocalDate(date);
  const daysUntilSunday = 7 - currentDate.getDay();
  currentDate.setDate(currentDate.getDate() + daysUntilSunday);
  return localDateString(currentDate);
}

function startOfWeek(date: string): string {
  const currentDate = parseLocalDate(date);
  currentDate.setDate(currentDate.getDate() - currentDate.getDay());
  return localDateString(currentDate);
}


import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { listen } from "@tauri-apps/api/event";
import type { Task, TaskMetadata, TaskPatch, TaskSortMode, TaskView } from "../types/tasks";
import * as tasksService from "../services/tasksService";
import { compareTasks, getDefaultTaskSortMode, groupByView, localDateString, MANUAL_SORT_VIEWS } from "../lib/tasks";
import { useNotesData } from "./NotesContext";

interface TasksContextValue {
  // Data
  tasks: TaskMetadata[];
  buckets: Record<TaskView, TaskMetadata[]>;
  today: string;
  isLoading: boolean;
  lastError: string | null;

  // Navigation
  selectedView: TaskView;
  selectedTaskId: string | null;
  selectedTaskIds: string[];
  selectedTask: Task | null;
  isLoadingTask: boolean;

  // Sort
  taskSortMode: TaskSortMode;
  setTaskSortMode: (mode: TaskSortMode) => void;
  taskViewOrders: Partial<Record<TaskView, string[]>>;
  setTaskViewOrder: (view: TaskView, ids: string[]) => void;

  // Actions
  selectView: (view: TaskView) => void;
  selectTask: (id: string | null) => void;
  toggleTaskSelection: (id: string) => void;
  selectTaskRange: (id: string) => void;
  selectAllVisibleTasks: () => void;
  clearTaskSelection: () => void;
  createTask: (title: string) => Promise<Task | null>;
  updateTask: (id: string, patch: TaskPatch) => Promise<Task | null>;
  setCompleted: (id: string, completed: boolean) => Promise<Task | null>;
  deleteTask: (id: string) => Promise<void>;
  refreshTasks: () => Promise<void>;
}

const TasksContext = createContext<TasksContextValue | null>(null);

export function TasksProvider({ children }: { children: ReactNode }) {
  const { notesFolder, settings } = useNotesData();
  const tasksEnabled = settings?.tasksEnabled ?? false;

  const [tasks, setTasks] = useState<TaskMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [selectedView, setSelectedView] = useState<TaskView>("inbox");
  const [taskSortModes, setTaskSortModes] = useState<Partial<Record<TaskView, TaskSortMode>>>({});
  const [taskViewOrders, setTaskViewOrdersState] = useState<Partial<Record<TaskView, string[]>>>({});
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isLoadingTask, setIsLoadingTask] = useState(false);

  const refreshRequestIdRef = useRef(0);
  const hasLoadedRef = useRef(false);
  const notesFolderRef = useRef(notesFolder);
  const selectedTaskIdRef = useRef<string | null>(null);
  const selectedTaskIdsRef = useRef<string[]>([]);
  const selectionAnchorIdRef = useRef<string | null>(null);
  notesFolderRef.current = notesFolder;
  selectedTaskIdRef.current = selectedTaskId;
  selectedTaskIdsRef.current = selectedTaskIds;

  const today = localDateString();
  const buckets = useMemo(() => groupByView(tasks, today), [tasks, today]);
  const taskSortMode = taskSortModes[selectedView] ?? getDefaultTaskSortMode(selectedView);
  const visibleTaskIds = useMemo(
    () =>
      [...(buckets[selectedView] ?? [])]
        .sort((a, b) => compareTasks(a, b, selectedView, taskSortMode, taskViewOrders[selectedView]))
        .map((task) => task.id),
    [buckets, selectedView, taskSortMode, taskViewOrders],
  );

  const setTaskViewOrder = useCallback((view: TaskView, ids: string[]) => {
    setTaskViewOrdersState((prev) => ({ ...prev, [view]: ids }));
    if (notesFolder) {
      void tasksService.setTaskViewOrder(view, ids);
    }
  }, [notesFolder]);

  const setTaskSortMode = useCallback((mode: TaskSortMode) => {
    setTaskSortModes((prev) => ({ ...prev, [selectedView]: mode }));
    // When switching to manual for the first time, seed the stored order from the
    // current visible order so the user sees no unexpected reordering.
    if (mode === "manual") {
      setTaskViewOrdersState((prev) => {
        if (prev[selectedView] !== undefined) return prev;
        return { ...prev, [selectedView]: visibleTaskIds };
      });
      if (notesFolder && taskViewOrders[selectedView] === undefined) {
        void tasksService.setTaskViewOrder(selectedView, visibleTaskIds);
      }
    }
  }, [selectedView, visibleTaskIds, taskViewOrders, notesFolder]);

  const setSelectionState = useCallback(
    (
      ids: string[],
      options?: { activeId?: string | null; anchorId?: string | null },
    ) => {
      const visibleTaskIdSet = new Set(visibleTaskIds);
      const orderedIds = visibleTaskIds.filter((id) => ids.includes(id));
      const requestedActiveId = options?.activeId ?? null;
      const nextActiveId =
        requestedActiveId && visibleTaskIdSet.has(requestedActiveId)
          ? requestedActiveId
          : orderedIds[0] ?? null;

      setSelectedTaskIds(orderedIds);
      setSelectedTaskId(nextActiveId);
      if (!nextActiveId) {
        setSelectedTask(null);
      }

      const requestedAnchorId = options?.anchorId ?? null;
      selectionAnchorIdRef.current =
        requestedAnchorId && visibleTaskIdSet.has(requestedAnchorId)
          ? requestedAnchorId
          : nextActiveId;
    },
    [visibleTaskIds],
  );

  const refreshTasks = useCallback(async () => {
    if (!tasksEnabled || !notesFolder) return;

    const requestId = ++refreshRequestIdRef.current;
    const folderAtStart = notesFolder;
    const isStale = () =>
      requestId !== refreshRequestIdRef.current ||
      notesFolderRef.current !== folderAtStart;

    const isInitialLoad = !hasLoadedRef.current;
    if (isInitialLoad) setIsLoading(true);

    try {
      const [result, ...viewOrders] = await Promise.all([
        tasksService.listTasks(),
        ...(isInitialLoad
          ? MANUAL_SORT_VIEWS.map((v) =>
              tasksService.getTaskViewOrder(v).catch((): string[] => []),
            )
          : []),
      ]);
      if (isStale()) return;
      hasLoadedRef.current = true;
      setTasks(result as TaskMetadata[]);
      if (isInitialLoad) {
        const ordersToSet: Partial<Record<TaskView, string[]>> = {};
        const sortModesToSet: Partial<Record<TaskView, TaskSortMode>> = {};
        MANUAL_SORT_VIEWS.forEach((view, i) => {
          const order = viewOrders[i] as string[];
          if (order && order.length > 0) {
            ordersToSet[view] = order;
            sortModesToSet[view] = "manual";
          }
        });
        if (Object.keys(ordersToSet).length > 0) {
          setTaskViewOrdersState(ordersToSet);
          setTaskSortModes((prev) => ({ ...prev, ...sortModesToSet }));
        }
      }
    } catch (err) {
      if (isStale()) return;
      setLastError(err instanceof Error ? err.message : "Failed to load tasks");
    } finally {
      if (isInitialLoad) setIsLoading(false);
    }
  }, [tasksEnabled, notesFolder]);

  // Load the full Task when selectedTaskId changes.
  useEffect(() => {
    if (!selectedTaskId) {
      setSelectedTask(null);
      return;
    }
    let cancelled = false;
    setIsLoadingTask(true);
    tasksService.readTask(selectedTaskId).then((task) => {
      if (!cancelled) {
        setSelectedTask(task);
        setIsLoadingTask(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setSelectedTask(null);
        setIsLoadingTask(false);
      }
    });
    return () => { cancelled = true; };
  }, [selectedTaskId]);

  // Initial load when enabled/folder changes.
  useEffect(() => {
    hasLoadedRef.current = false;
    setTasks([]);
    setSelectedTaskId(null);
    setSelectedTaskIds([]);
    setSelectedTask(null);
    selectionAnchorIdRef.current = null;
    if (!tasksEnabled) {
      return;
    }
    if (!notesFolder) return;
    void refreshTasks();
  }, [tasksEnabled, notesFolder]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for file-watcher events from the tasks folder.
  useEffect(() => {
    if (!tasksEnabled) return;
    const unlisten = listen("tasks-changed", () => {
      void refreshTasks();
    });
    return () => { void unlisten.then((fn) => fn()); };
  }, [tasksEnabled, refreshTasks]);

  const selectView = useCallback((view: TaskView) => {
    setSelectedView(view);
    setSelectedTaskId(null);
    setSelectedTaskIds([]);
    setSelectedTask(null);
    selectionAnchorIdRef.current = null;
  }, []);

  const selectTask = useCallback((id: string | null) => {
    if (!id) {
      setSelectedTaskIds([]);
      setSelectedTaskId(null);
      setSelectedTask(null);
      selectionAnchorIdRef.current = null;
      return;
    }

    // Bypass visibleTaskIds filtering so tasks selected from search results
    // (which may not be in the current view's sorted list) are accepted.
    setSelectedTaskIds([id]);
    setSelectedTaskId(id);
    selectionAnchorIdRef.current = id;
  }, []);

  const toggleTaskSelection = useCallback((id: string) => {
    if (!visibleTaskIds.includes(id)) return;

    const nextSelection = new Set(selectedTaskIdsRef.current);
    if (nextSelection.has(id)) {
      nextSelection.delete(id);
    } else {
      nextSelection.add(id);
    }

    const orderedIds = visibleTaskIds.filter((taskId) => nextSelection.has(taskId));
    const nextActiveId = nextSelection.has(id)
      ? id
      : selectedTaskIdRef.current === id
        ? orderedIds[orderedIds.length - 1] ?? null
        : selectedTaskIdRef.current && orderedIds.includes(selectedTaskIdRef.current)
          ? selectedTaskIdRef.current
          : orderedIds[orderedIds.length - 1] ?? null;

    setSelectionState(orderedIds, {
      activeId: nextActiveId,
      anchorId: selectionAnchorIdRef.current ?? id,
    });
  }, [setSelectionState, visibleTaskIds]);

  const selectTaskRange = useCallback((id: string) => {
    const targetIndex = visibleTaskIds.indexOf(id);
    if (targetIndex === -1) return;

    const anchorId =
      selectionAnchorIdRef.current ??
      selectedTaskIdRef.current ??
      selectedTaskIdsRef.current[0] ??
      id;
    const anchorIndex = visibleTaskIds.indexOf(anchorId);
    const normalizedAnchorIndex = anchorIndex === -1 ? targetIndex : anchorIndex;
    const start = Math.min(normalizedAnchorIndex, targetIndex);
    const end = Math.max(normalizedAnchorIndex, targetIndex);
    const orderedIds = visibleTaskIds.slice(start, end + 1);

    setSelectionState(orderedIds, {
      activeId: id,
      anchorId:
        anchorIndex === -1
          ? visibleTaskIds[targetIndex]
          : visibleTaskIds[normalizedAnchorIndex],
    });
  }, [setSelectionState, visibleTaskIds]);

  const selectAllVisibleTasks = useCallback(() => {
    if (visibleTaskIds.length === 0) return;
    const lastId = visibleTaskIds[visibleTaskIds.length - 1];
    setSelectionState(visibleTaskIds, {
      activeId: lastId,
      anchorId: visibleTaskIds[0],
    });
  }, [setSelectionState, visibleTaskIds]);

  const clearTaskSelection = useCallback(() => {
    const activeTaskId = selectedTaskIdRef.current;
    if (activeTaskId && visibleTaskIds.includes(activeTaskId)) {
      setSelectionState([activeTaskId], {
        activeId: activeTaskId,
        anchorId: activeTaskId,
      });
      return;
    }

    setSelectionState([], { activeId: null, anchorId: null });
  }, [setSelectionState, visibleTaskIds]);

  useEffect(() => {
    const visibleTaskIdSet = new Set(visibleTaskIds);
    const allTaskIdSet = new Set(tasks.map((t) => t.id));

    // Prune multi-select to only tasks visible in the current view.
    const filteredIds = visibleTaskIds.filter((id) =>
      selectedTaskIdsRef.current.includes(id),
    );
    const activeTaskId = selectedTaskIdRef.current;

    // Keep the detail panel open as long as the task still exists anywhere —
    // even if it moved to a different view. Only clear when actually deleted.
    const nextActiveId =
      activeTaskId && allTaskIdSet.has(activeTaskId)
        ? activeTaskId
        : filteredIds[0] ?? null;

    // List selection only reflects visible tasks.
    const nextSelectionIds =
      filteredIds.length > 0
        ? filteredIds
        : nextActiveId && visibleTaskIdSet.has(nextActiveId)
          ? [nextActiveId]
          : [];

    const selectionChanged =
      selectedTaskIdsRef.current.length !== nextSelectionIds.length ||
      selectedTaskIdsRef.current.some((id, index) => id !== nextSelectionIds[index]);
    if (selectionChanged) {
      setSelectedTaskIds(nextSelectionIds);
    }

    if (nextActiveId !== activeTaskId) {
      setSelectedTaskId(nextActiveId);
      if (!nextActiveId) {
        setSelectedTask(null);
      }
    }

    if (
      selectionAnchorIdRef.current &&
      !visibleTaskIdSet.has(selectionAnchorIdRef.current)
    ) {
      selectionAnchorIdRef.current = nextActiveId && visibleTaskIdSet.has(nextActiveId)
        ? nextActiveId
        : null;
    }
  }, [visibleTaskIds, tasks]);

  const createTask = useCallback(async (title: string): Promise<Task | null> => {
    try {
      const task = await tasksService.createTask(title);
      // Optimistic insert into the metadata list.
      setTasks((prev) => [
        ...prev,
        {
          id: task.id,
          title: task.title,
          description: task.description,
          link: task.link,
          waitingFor: task.waitingFor,
          createdAt: task.createdAt,
          actionAt: task.actionAt,
          scheduleBucket: task.scheduleBucket,
          completedAt: task.completedAt,
          starred: task.starred,
          dueAt: task.dueAt,
          recurrence: task.recurrence,
        },
      ]);
      return task;
    } catch (err) {
      setLastError(err instanceof Error ? err.message : "Failed to create task");
      return null;
    }
  }, []);

  const updateTask = useCallback(async (id: string, patch: TaskPatch): Promise<Task | null> => {
    try {
      const task = await tasksService.updateTask(id, patch);
      setTasks((prev) =>
        prev.map((t) =>
          t.id === id
            ? {
                ...t,
                title: task.title,
                description: task.description,
                link: task.link,
                waitingFor: task.waitingFor,
                actionAt: task.actionAt,
                scheduleBucket: task.scheduleBucket,
                starred: task.starred,
                dueAt: task.dueAt,
                recurrence: task.recurrence,
              }
            : t
        )
      );
      if (selectedTaskId === id) {
        setSelectedTask(task);
      }
      return task;
    } catch (err) {
      setLastError(err instanceof Error ? err.message : "Failed to update task");
      return null;
    }
  }, [selectedTaskId]);

  const setCompleted = useCallback(async (id: string, completed: boolean): Promise<Task | null> => {
    try {
      const task = await tasksService.setTaskCompleted(id, completed);
      setTasks((prev) =>
        prev.map((t) =>
          t.id === id ? { ...t, completedAt: task.completedAt } : t
        )
      );
      if (selectedTaskId === id) {
        setSelectedTask(task);
      }
      return task;
    } catch (err) {
      setLastError(err instanceof Error ? err.message : "Failed to update task");
      return null;
    }
  }, [selectedTaskId]);

  const deleteTask = useCallback(async (id: string): Promise<void> => {
    try {
      await tasksService.deleteTask(id);
      setTasks((prev) => prev.filter((t) => t.id !== id));
      setSelectedTaskIds((prev) => prev.filter((taskId) => taskId !== id));
      if (selectedTaskId === id) {
        setSelectedTaskId(null);
        setSelectedTask(null);
      }
    } catch (err) {
      setLastError(err instanceof Error ? err.message : "Failed to delete task");
    }
  }, [selectedTaskId]);

  const value = useMemo<TasksContextValue>(
    () => ({
      tasks,
      buckets,
      today,
      isLoading,
      lastError,
      selectedView,
      selectedTaskId,
      selectedTaskIds,
      selectedTask,
      isLoadingTask,
      taskSortMode,
      setTaskSortMode,
      taskViewOrders,
      setTaskViewOrder,
      selectView,
      selectTask,
      toggleTaskSelection,
      selectTaskRange,
      selectAllVisibleTasks,
      clearTaskSelection,
      createTask,
      updateTask,
      setCompleted,
      deleteTask,
      refreshTasks,
    }),
    [
      tasks,
      buckets,
      today,
      isLoading,
      lastError,
      selectedView,
      selectedTaskId,
      selectedTaskIds,
      selectedTask,
      isLoadingTask,
      taskSortMode,
      setTaskSortMode,
      taskViewOrders,
      setTaskViewOrder,
      selectView,
      selectTask,
      toggleTaskSelection,
      selectTaskRange,
      selectAllVisibleTasks,
      clearTaskSelection,
      createTask,
      updateTask,
      setCompleted,
      deleteTask,
      refreshTasks,
    ]
  );

  return <TasksContext.Provider value={value}>{children}</TasksContext.Provider>;
}

const TASKS_NOOP: TasksContextValue = {
  tasks: [],
  buckets: { inbox: [], today: [], upcoming: [], waiting: [], anytime: [], someday: [], completed: [], starred: [] },
  today: "",
  isLoading: false,
  lastError: null,
  selectedView: "inbox",
  selectedTaskId: null,
  selectedTaskIds: [],
  selectedTask: null,
  isLoadingTask: false,
  taskSortMode: "createdAsc",
  setTaskSortMode: () => {},
  taskViewOrders: {},
  setTaskViewOrder: () => {},
  selectView: () => {},
  selectTask: () => {},
  toggleTaskSelection: () => {},
  selectTaskRange: () => {},
  selectAllVisibleTasks: () => {},
  clearTaskSelection: () => {},
  createTask: async () => null,
  updateTask: async () => null,
  setCompleted: async () => null,
  deleteTask: async () => {},
  refreshTasks: async () => {},
};

export function useTasks(): TasksContextValue {
  return useContext(TasksContext) ?? TASKS_NOOP;
}

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
import type { Task, TaskMetadata, TaskPatch, TaskView } from "../types/tasks";
import * as tasksService from "../services/tasksService";
import { groupByView, localDateString } from "../lib/tasks";
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
  selectedTask: Task | null;
  isLoadingTask: boolean;

  // Actions
  selectView: (view: TaskView) => void;
  selectTask: (id: string | null) => void;
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
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isLoadingTask, setIsLoadingTask] = useState(false);

  const refreshRequestIdRef = useRef(0);
  const hasLoadedRef = useRef(false);
  const notesFolderRef = useRef(notesFolder);
  notesFolderRef.current = notesFolder;

  const today = localDateString();
  const buckets = useMemo(() => groupByView(tasks, today), [tasks, today]);

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
      const result = await tasksService.listTasks();
      if (isStale()) return;
      hasLoadedRef.current = true;
      setTasks(result);
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
    setSelectedTask(null);
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
    setSelectedTask(null);
  }, []);

  const selectTask = useCallback((id: string | null) => {
    setSelectedTaskId(id);
  }, []);

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
      selectedTask,
      isLoadingTask,
      selectView,
      selectTask,
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
      selectedTask,
      isLoadingTask,
      selectView,
      selectTask,
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
  buckets: { inbox: [], today: [], upcoming: [], anytime: [], someday: [], completed: [] },
  today: "",
  isLoading: false,
  lastError: null,
  selectedView: "inbox",
  selectedTaskId: null,
  selectedTask: null,
  isLoadingTask: false,
  selectView: () => {},
  selectTask: () => {},
  createTask: async () => null,
  updateTask: async () => null,
  setCompleted: async () => null,
  deleteTask: async () => {},
  refreshTasks: async () => {},
};

export function useTasks(): TasksContextValue {
  return useContext(TasksContext) ?? TASKS_NOOP;
}

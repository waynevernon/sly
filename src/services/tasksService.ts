import { invoke } from "@tauri-apps/api/core";
import type { Task, TaskMetadata, TaskPatch } from "../types/tasks";

export async function listTasks(): Promise<TaskMetadata[]> {
  return invoke("list_tasks");
}

export async function readTask(id: string): Promise<Task> {
  return invoke("read_task", { id });
}

export async function createTask(title: string): Promise<Task> {
  return invoke("create_task", { title });
}

export async function updateTask(id: string, patch: TaskPatch): Promise<Task> {
  return invoke("update_task", { id, patch });
}

export async function setTaskCompleted(id: string, completed: boolean): Promise<Task> {
  return invoke("set_task_completed", { id, completed });
}

export async function deleteTask(id: string): Promise<void> {
  return invoke("delete_task", { id });
}

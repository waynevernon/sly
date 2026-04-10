export type TaskView = 'inbox' | 'today' | 'upcoming' | 'completed';

export interface TaskMetadata {
  id: string;
  title: string;
  createdAt: string;
  actionAt: string | null;
  completedAt: string | null;
}

export interface Task extends TaskMetadata {
  description: string;
}

export interface TaskPatch {
  title?: string;
  description?: string;
  actionAt?: string | null;
}

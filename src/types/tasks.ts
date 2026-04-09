export type TaskView = 'inbox' | 'today' | 'upcoming' | 'someday' | 'waiting' | 'logbook';

export interface TaskMetadata {
  id: string;
  title: string;
  createdAt: string;
  actionDate: string | null;
  waiting: boolean;
  someday: boolean;
  completedAt: string | null;
}

export interface Task extends TaskMetadata {
  notes: string;
}

export interface TaskPatch {
  title?: string;
  actionDate?: string | null;
  waiting?: boolean;
  someday?: boolean;
  notes?: string;
}

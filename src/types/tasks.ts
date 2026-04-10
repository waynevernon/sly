export type TaskScheduleBucket = 'anytime' | 'someday';

export type TaskView = 'inbox' | 'today' | 'upcoming' | 'anytime' | 'someday' | 'completed';

export interface TaskMetadata {
  id: string;
  title: string;
  description: string;
  link: string;
  waitingFor: string;
  createdAt: string;
  actionAt: string | null;
  scheduleBucket: TaskScheduleBucket | null;
  completedAt: string | null;
}

export interface Task extends TaskMetadata {
}

export interface TaskPatch {
  title?: string;
  description?: string;
  link?: string;
  waitingFor?: string;
  actionAt?: string | null;
  scheduleBucket?: TaskScheduleBucket | null;
}

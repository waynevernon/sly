export type TaskScheduleBucket = 'anytime' | 'someday';

export type TaskView = 'inbox' | 'today' | 'upcoming' | 'waiting' | 'anytime' | 'someday' | 'completed' | 'starred';

export type TaskSortMode =
  | 'actionAsc' | 'actionDesc'
  | 'createdAsc' | 'createdDesc'
  | 'titleAsc' | 'titleDesc'
  | 'completedAsc' | 'completedDesc'
  | 'manual';

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
  starred: boolean;
  dueAt: string | null;
  recurrence: string | null;
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
  starred?: boolean;
  dueAt?: string | null;
  recurrence?: string | null;
}

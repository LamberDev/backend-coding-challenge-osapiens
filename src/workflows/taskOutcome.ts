import type { Task } from '../models/Task';
import type { Result } from '../models/Result';
import { TaskStatus } from '../workers/taskStatus';

export interface SiblingTask {
  task: Task;
  result: Result | null;
}

export interface TaskOutcomeEntry {
  taskId: string;
  type: string;
  status: TaskStatus;
  output: unknown;
  error?: string;
}

const FAILED_TASK_NOTE =
  'Task failed; no error detail is persisted by the current data model.';

export function parseOutput(result: Result | null): unknown {
  if (result?.data == null) {
    return null;
  }
  try {
    return JSON.parse(result.data);
  } catch {
    return result.data;
  }
}

const entryRenderers: Record<
  string,
  (sibling: SiblingTask) => TaskOutcomeEntry
> = {
  [TaskStatus.Completed]: ({ task, result }) => ({
    taskId: task.taskId,
    type: task.taskType,
    status: TaskStatus.Completed,
    output: parseOutput(result),
  }),
  [TaskStatus.Failed]: ({ task }) => ({
    taskId: task.taskId,
    type: task.taskType,
    status: TaskStatus.Failed,
    output: null,
    error: FAILED_TASK_NOTE,
  }),
};

function renderUnsettled(sibling: SiblingTask): TaskOutcomeEntry {
  return {
    taskId: sibling.task.taskId,
    type: sibling.task.taskType,
    status: sibling.task.status,
    output: null,
    error: `Task is not settled (status: ${sibling.task.status}).`,
  };
}

export function toTaskOutcomeEntry(sibling: SiblingTask): TaskOutcomeEntry {
  const render = entryRenderers[sibling.task.status] ?? renderUnsettled;
  return render(sibling);
}

import { TaskStatus } from '../workers/taskStatus';
import { WorkflowStatus } from './workflowStatus';
import { SiblingTask, TaskOutcomeEntry, toTaskOutcomeEntry } from './taskOutcome';

export interface WorkflowFinalResult {
  workflowId: string;
  status: WorkflowStatus;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  tasks: TaskOutcomeEntry[];
  summary: string;
}

export function resolveWorkflowStatus(statuses: TaskStatus[]): WorkflowStatus {
  if (statuses.some((s) => s === TaskStatus.Failed)) {
    return WorkflowStatus.Failed;
  }
  if (statuses.every((s) => s === TaskStatus.Completed)) {
    return WorkflowStatus.Completed;
  }
  return WorkflowStatus.InProgress;
}

export function isTerminalWorkflowStatus(status: WorkflowStatus): boolean {
  return status === WorkflowStatus.Completed || status === WorkflowStatus.Failed;
}

// Aggregates every task (unlike the report, which only covers preceding tasks
// and enforces a settled precondition) so finalResult captures failures too.
export function buildWorkflowFinalResult(
  workflowId: string,
  status: WorkflowStatus,
  siblings: SiblingTask[],
): WorkflowFinalResult {
  const tasks = siblings.map(toTaskOutcomeEntry);
  const completedTasks = tasks.filter(
    (t) => t.status === TaskStatus.Completed,
  ).length;
  const failedTasks = tasks.filter(
    (t) => t.status === TaskStatus.Failed,
  ).length;

  return {
    workflowId,
    status,
    totalTasks: tasks.length,
    completedTasks,
    failedTasks,
    tasks,
    summary: `Workflow ${status}: ${completedTasks}/${tasks.length} task(s) completed, ${failedTasks} failed.`,
  };
}

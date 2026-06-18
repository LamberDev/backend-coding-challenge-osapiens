import type { Task } from '../models/Task';
import { TaskStatus } from '../workers/taskStatus';
import {
  SiblingTask,
  TaskOutcomeEntry,
  toTaskOutcomeEntry,
} from '../workflows/taskOutcome';

export type { SiblingTask } from '../workflows/taskOutcome';

export type ReportTaskEntry = TaskOutcomeEntry;

export interface WorkflowReport {
  workflowId: string;
  tasks: ReportTaskEntry[];
  finalReport: string;
}

const SETTLED_STATUSES: ReadonlySet<TaskStatus> = new Set([
  TaskStatus.Completed,
  TaskStatus.Failed,
]);

export function selectPrecedingTasks(
  siblings: SiblingTask[],
  reportTask: Task,
): SiblingTask[] {
  return siblings
    .filter(
      ({ task }) =>
        task.taskId !== reportTask.taskId &&
        task.stepNumber < reportTask.stepNumber,
    )
    .sort((a, b) => a.task.stepNumber - b.task.stepNumber);
}

/** @throws {Error} If any preceding task is still queued or in progress. */
export function validatePrecedingTasksSettled(preceding: SiblingTask[]): void {
  const unsettled = preceding.filter(
    ({ task }) => !SETTLED_STATUSES.has(task.status),
  );
  if (unsettled.length === 0) {
    return;
  }
  const ids = unsettled.map(({ task }) => task.taskId).join(', ');
  throw new Error(
    `Cannot generate report: ${unsettled.length} preceding task(s) not settled: ${ids}`,
  );
}

function summarize(entries: ReportTaskEntry[]): string {
  const completed = entries.filter(
    (e) => e.status === TaskStatus.Completed,
  ).length;
  const failed = entries.filter((e) => e.status === TaskStatus.Failed).length;
  return `Aggregated ${entries.length} preceding task(s): ${completed} completed, ${failed} failed.`;
}

/** @throws {Error} If a preceding task is not yet settled. */
export function buildWorkflowReport(
  reportTask: Task,
  siblings: SiblingTask[],
): WorkflowReport {
  const preceding = selectPrecedingTasks(siblings, reportTask);
  validatePrecedingTasksSettled(preceding);
  const tasks = preceding.map(toTaskOutcomeEntry);

  return {
    workflowId: reportTask.workflow.workflowId,
    tasks,
    finalReport: summarize(tasks),
  };
}

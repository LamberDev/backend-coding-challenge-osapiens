import type { Task } from '../models/Task';
import type { Result } from '../models/Result';
import { TaskStatus } from '../workers/taskStatus';

/** A workflow task paired with its persisted Result (null when none was stored). */
export interface SiblingTask {
  task: Task;
  result: Result | null;
}

/** One row in the aggregated report, describing a single preceding task. */
export interface ReportTaskEntry {
  taskId: string;
  type: string;
  status: TaskStatus;
  output: unknown;
  error?: string;
}

/** The aggregated report stored as the `ReportGenerationJob` output. */
export interface WorkflowReport {
  workflowId: string;
  tasks: ReportTaskEntry[];
  finalReport: string;
}

/** Terminal states a preceding task must reach before the report may run. */
const SETTLED_STATUSES: ReadonlySet<TaskStatus> = new Set([
  TaskStatus.Completed,
  TaskStatus.Failed,
]);

const FAILED_TASK_NOTE =
  'Task failed; no error detail is persisted by the current data model.';

/** Decodes a Result's serialized data back into the original job output. */
function parseOutput(result: Result | null): unknown {
  if (result?.data == null) {
    return null;
  }
  try {
    return JSON.parse(result.data);
  } catch {
    return result.data;
  }
}

/**
 * MAP from task status to the report entry it produces.
 */
const entryRenderers: Record<
  string,
  (sibling: SiblingTask) => ReportTaskEntry
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

function renderUnsettled(sibling: SiblingTask): ReportTaskEntry {
  return {
    taskId: sibling.task.taskId,
    type: sibling.task.taskType,
    status: sibling.task.status,
    output: null,
    error: `Task is not settled (status: ${sibling.task.status}).`,
  };
}

function toReportEntry(sibling: SiblingTask): ReportTaskEntry {
  const render = entryRenderers[sibling.task.status] ?? renderUnsettled;
  return render(sibling);
}

/**
 * Returns the sibling tasks that precede the report task (lower `stepNumber`),
 * excluding the report task itself, ordered by `stepNumber` ascending.
 */
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

/**
 * Enforces the precondition that every preceding task has reached a terminal
 * state before the report runs.
 * @throws {Error} If any preceding task is still queued or in progress.
 */
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

/** One-line human summary of how the aggregated tasks turned out. */
function summarize(entries: ReportTaskEntry[]): string {
  const completed = entries.filter(
    (e) => e.status === TaskStatus.Completed,
  ).length;
  const failed = entries.filter((e) => e.status === TaskStatus.Failed).length;
  return `Aggregated ${entries.length} preceding task(s): ${completed} completed, ${failed} failed.`;
}

/**
 * Pure aggregation entry point: selects the preceding tasks, enforces that they
 * are all settled, then assembles the workflow report.
 * @throws {Error} If a preceding task is not yet settled.
 */
export function buildWorkflowReport(
  reportTask: Task,
  siblings: SiblingTask[],
): WorkflowReport {
  const preceding = selectPrecedingTasks(siblings, reportTask);
  validatePrecedingTasksSettled(preceding);
  const tasks = preceding.map(toReportEntry);

  return {
    workflowId: reportTask.workflow.workflowId,
    tasks,
    finalReport: summarize(tasks),
  };
}

import { Task } from '../models/Task';
import { TaskStatus } from './taskStatus';
import { WorkflowStep } from '../workflows/WorkflowFactory';

export type DependencyOutcome = 'ready' | 'wait' | 'cascade-fail';

const STATUS_TO_OUTCOME: Partial<Record<TaskStatus, DependencyOutcome>> = {
  [TaskStatus.Completed]: 'ready',
  [TaskStatus.Failed]: 'cascade-fail',
  [TaskStatus.Queued]: 'wait',
  [TaskStatus.InProgress]: 'wait',
};

/**
 * Determines whether a task is ready to run based on its dependency status.
 */
export function checkDependencyReadiness(task: Task): DependencyOutcome {
  const dep = task.dependsOn;

  if (dep == null) {
    return 'ready';
  }

  return STATUS_TO_OUTCOME[dep.status] ?? 'wait';
}

type VisitState = 'unvisited' | 'in-stack' | 'done';

function assertAllReferencesExist(
  steps: WorkflowStep[],
  stepByNumber: Map<number, WorkflowStep>,
): void {
  for (const step of steps) {
    if (step.dependsOn !== undefined && !stepByNumber.has(step.dependsOn)) {
      throw new Error(
        `Workflow step ${step.stepNumber} references unknown stepNumber ${step.dependsOn} in dependsOn`,
      );
    }
  }
}

function visitStep(
  stepNumber: number,
  stepByNumber: Map<number, WorkflowStep>,
  visitState: Map<number, VisitState>,
): void {
  const state = visitState.get(stepNumber);

  if (state === 'done') return;
  if (state === 'in-stack') {
    throw new Error(
      `Cycle detected in workflow steps involving stepNumber ${stepNumber}`,
    );
  }

  visitState.set(stepNumber, 'in-stack');

  const step = stepByNumber.get(stepNumber)!;
  if (step.dependsOn !== undefined) {
    visitStep(step.dependsOn, stepByNumber, visitState);
  }

  visitState.set(stepNumber, 'done');
}

/**
 * Validates that the given workflow steps form a DAG
 */
export function detectCycle(steps: WorkflowStep[]): void {
  const stepByNumber = new Map(steps.map((s) => [s.stepNumber, s]));

  assertAllReferencesExist(steps, stepByNumber);

  const visitState = new Map<number, VisitState>(
    steps.map((s) => [s.stepNumber, 'unvisited']),
  );

  for (const step of steps) {
    if (visitState.get(step.stepNumber) === 'unvisited') {
      visitStep(step.stepNumber, stepByNumber, visitState);
    }
  }
}

import { TaskStatus } from '../workers/taskStatus';
import { WorkflowStatus } from './workflowStatus';
import { resolveWorkflowStatus } from './finalResultBuilder';

export interface WorkflowStatusSummary {
  workflowId: string;
  status: WorkflowStatus;
  completedTasks: number;
  totalTasks: number;
}

export function summarizeWorkflow(
  workflowId: string,
  statuses: TaskStatus[],
): WorkflowStatusSummary {
  return {
    workflowId,
    status: resolveWorkflowStatus(statuses),
    completedTasks: statuses.filter((s) => s === TaskStatus.Completed).length,
    totalTasks: statuses.length,
  };
}

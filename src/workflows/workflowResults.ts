import { WorkflowStatus } from './workflowStatus';
import { parseJsonWithFallback } from './taskOutcome';

export type WorkflowResultsOutcome =
  | {
      ready: true;
      body: { workflowId: string; status: WorkflowStatus; finalResult: unknown };
    }
  | { ready: false };

export function resolveWorkflowResults(
  workflowId: string,
  status: WorkflowStatus,
  rawFinalResult: string | null,
): WorkflowResultsOutcome {
  if (status !== WorkflowStatus.Completed) {
    return { ready: false };
  }
  return {
    ready: true,
    body: { workflowId, status, finalResult: parseJsonWithFallback(rawFinalResult) },
  };
}

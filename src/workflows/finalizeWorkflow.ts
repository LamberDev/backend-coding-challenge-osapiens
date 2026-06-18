import { EntityManager } from 'typeorm';
import { Workflow } from '../models/Workflow';
import { loadWorkflowSiblings } from './loadWorkflowSiblings';
import {
  buildWorkflowFinalResult,
  isTerminalWorkflowStatus,
  resolveWorkflowStatus,
} from './finalResultBuilder';

// Single source of truth for a workflow's terminal state. Called from every
// settle path (TaskRunner success + failure, and the worker's cascade-fail) so
// a workflow is never left stuck in_progress. Re-finalizing on each settle is
// intentional: an early failure keeps absorbing later cascade failures.
//
// Assumes serialized invocation (the single-threaded poller). This is a
// read-modify-write with no optimistic lock; concurrent workers would need a
// @VersionColumn on Workflow or a guarded UPDATE.
export async function finalizeWorkflow(
  manager: EntityManager,
  workflowId: string,
): Promise<void> {
  const workflowRepository = manager.getRepository(Workflow);
  const workflow = await workflowRepository.findOne({ where: { workflowId } });
  if (!workflow) {
    return;
  }

  const siblings = await loadWorkflowSiblings(manager, workflowId);
  const status = resolveWorkflowStatus(siblings.map(({ task }) => task.status));

  workflow.status = status;
  if (isTerminalWorkflowStatus(status)) {
    workflow.finalResult = JSON.stringify(
      buildWorkflowFinalResult(workflowId, status, siblings),
    );
  }
  await workflowRepository.save(workflow);
}

import { Router } from 'express';
import { AppDataSource } from '../data-source';
import { WorkflowQueryService } from '../workflows/workflowQueryService';
import { HttpError, NotFoundError } from '../http/HttpError';
import { SuccessResult } from '../http/SuccessResult';
import { jsonController } from '../http/jsonController';

const service = new WorkflowQueryService(AppDataSource);

export const getWorkflowStatus = jsonController(async (req) => {
  const summary = await service.getStatus(req.params.id);
  if (!summary) {
    throw new NotFoundError('Workflow not found');
  }
  return new SuccessResult(summary);
});

export const getWorkflowResults = jsonController(async (req) => {
  const outcome = await service.getResults(req.params.id);
  if (!outcome) {
    throw new NotFoundError('Workflow not found');
  }
  if (!outcome.ready) {
    throw new HttpError(400, 'Workflow is not completed');
  }
  return new SuccessResult(outcome.body);
});

const router = Router();
router.get('/:id/status', getWorkflowStatus);
router.get('/:id/results', getWorkflowResults);

export default router;

import { Router } from 'express';
import { AppDataSource } from '../data-source';
import { WorkflowStatusService } from '../workflows/workflowStatusService';
import { NotFoundError } from '../http/HttpError';
import { SuccessResult } from '../http/SuccessResult';
import { jsonController } from '../http/jsonController';

const service = new WorkflowStatusService(AppDataSource);

export const getWorkflowStatus = jsonController(async (req) => {
  const summary = await service.getStatus(req.params.id);
  if (!summary) {
    throw new NotFoundError('Workflow not found');
  }
  return new SuccessResult(summary);
});

const router = Router();
router.get('/:id/status', getWorkflowStatus);

export default router;

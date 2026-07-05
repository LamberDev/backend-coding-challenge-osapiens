import { Router } from 'express';
import { AppDataSource } from '../data-source';
import { WorkflowFactory } from '../workflows/WorkflowFactory'; // Create a folder for factories if you prefer
import { HttpError } from '../http/HttpError';
import { SuccessResult } from '../http/SuccessResult';
import { jsonController } from '../http/jsonController';
import path from 'path';

const router = Router();
const workflowFactory = new WorkflowFactory(AppDataSource);

router.post(
  '/',
  jsonController(async (req) => {
    const { clientId, geoJson } = req.body;
    const workflowFile = path.join(
      __dirname,
      '../workflows/example_workflow.yml',
    );

    try {
      const workflow = await workflowFactory.createWorkflowFromYAML(
        workflowFile,
        clientId,
        JSON.stringify(geoJson),
      );
      return new SuccessResult(
        {
          workflowId: workflow.workflowId,
          message: 'Workflow created and tasks queued from YAML definition.',
        },
        202,
      );
    } catch (error) {
      console.error('Error creating workflow:', error);
      throw new HttpError(500, 'Failed to create workflow');
    }
  }),
);

export default router;

import { Job } from './Job';
import { Task } from '../models/Task';
import { AppDataSource } from '../data-source';
import { buildWorkflowReport, WorkflowReport } from './reportBuilder';
import { loadWorkflowSiblings } from '../workflows/loadWorkflowSiblings';

// IO shell: loads the workflow's siblings and delegates aggregation to the pure
// buildWorkflowReport. Throwing (e.g. a preceding task not yet settled) lets
// TaskRunner mark this task as Failed.
export class ReportGenerationJob implements Job {
  async run(task: Task): Promise<WorkflowReport> {
    const siblings = await loadWorkflowSiblings(
      AppDataSource.manager,
      task.workflow.workflowId,
    );
    return buildWorkflowReport(task, siblings);
  }
}

import { DataSource } from 'typeorm';
import { Workflow } from '../models/Workflow';
import { summarizeWorkflow, WorkflowStatusSummary } from './workflowStatusSummary';
import {
  resolveWorkflowResults,
  WorkflowResultsOutcome,
} from './workflowResults';

// Application layer: owns data access for workflow read endpoints so the
// controllers stay HTTP-only.
export class WorkflowQueryService {
  constructor(private readonly dataSource: DataSource) {}

  async getStatus(workflowId: string): Promise<WorkflowStatusSummary | null> {
    const workflow = await this.dataSource.getRepository(Workflow).findOne({
      where: { workflowId },
      relations: ['tasks'],
    });
    if (!workflow) {
      return null;
    }
    return summarizeWorkflow(
      workflow.workflowId,
      workflow.tasks.map((t) => t.status),
    );
  }

  async getResults(
    workflowId: string,
  ): Promise<WorkflowResultsOutcome | null> {
    const wf = await this.dataSource.getRepository(Workflow).findOne({
      where: { workflowId },
      select: ['workflowId', 'status', 'finalResult'],
    });
    if (!wf) {
      return null;
    }
    return resolveWorkflowResults(wf.workflowId, wf.status, wf.finalResult ?? null);
  }
}

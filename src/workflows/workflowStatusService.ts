import { DataSource } from 'typeorm';
import { Workflow } from '../models/Workflow';
import { summarizeWorkflow, WorkflowStatusSummary } from './workflowStatusSummary';

// Application layer: owns data access for the status query so the controller
// stays HTTP-only.
export class WorkflowStatusService {
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
}

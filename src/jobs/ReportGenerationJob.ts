import { In } from 'typeorm';
import { Job } from './Job';
import { Task } from '../models/Task';
import { Result } from '../models/Result';
import { AppDataSource } from '../data-source';
import {
  buildWorkflowReport,
  SiblingTask,
  WorkflowReport,
} from './reportBuilder';

/**
 * Aggregates the outputs of every preceding task in the workflow into a single
 * JSON report. The pure aggregation lives in `reportBuilder`; this class is the
 * IO shell that loads the sibling tasks and their results from the database and
 * delegates the assembly. Throwing (e.g. a preceding task not yet settled) lets
 * `TaskRunner` mark this task as `Failed`.
 */
export class ReportGenerationJob implements Job {
  async run(task: Task): Promise<WorkflowReport> {
    const siblings = await this.loadSiblings(task.workflow.workflowId);
    return buildWorkflowReport(task, siblings);
  }

  /** Loads every task of the workflow paired with its persisted Result. */
  private async loadSiblings(workflowId: string): Promise<SiblingTask[]> {
    const tasks = await AppDataSource.getRepository(Task).find({
      where: { workflow: { workflowId } },
      relations: ['workflow'],
      order: { stepNumber: 'ASC' },
    });
    const resultById = await this.loadResultsById(tasks);

    return tasks.map((task) => ({
      task,
      result: task.resultId ? (resultById.get(task.resultId) ?? null) : null,
    }));
  }

  /** Fetches every referenced Result in a single query, keyed by `resultId`. */
  private async loadResultsById(tasks: Task[]): Promise<Map<string, Result>> {
    const resultIds = tasks
      .map((task) => task.resultId)
      .filter((id): id is string => Boolean(id));

    if (resultIds.length === 0) {
      return new Map();
    }

    const results = await AppDataSource.getRepository(Result).find({
      where: { resultId: In(resultIds) },
    });

    return new Map(results.map((result) => [result.resultId, result]));
  }
}

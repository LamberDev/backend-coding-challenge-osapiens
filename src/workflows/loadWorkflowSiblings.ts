import { EntityManager, In } from 'typeorm';
import { Task } from '../models/Task';
import { Result } from '../models/Result';
import { SiblingTask } from './taskOutcome';

// Takes an EntityManager so the caller owns the connection/transaction.
export async function loadWorkflowSiblings(
  manager: EntityManager,
  workflowId: string,
): Promise<SiblingTask[]> {
  const tasks = await manager.getRepository(Task).find({
    where: { workflow: { workflowId } },
    relations: ['workflow'],
    order: { stepNumber: 'ASC' },
  });
  const resultById = await loadResultsById(manager, tasks);

  return tasks.map((task) => ({
    task,
    result: task.resultId ? (resultById.get(task.resultId) ?? null) : null,
  }));
}

async function loadResultsById(
  manager: EntityManager,
  tasks: Task[],
): Promise<Map<string, Result>> {
  const resultIds = tasks
    .map((task) => task.resultId)
    .filter((id): id is string => Boolean(id));

  if (resultIds.length === 0) {
    return new Map();
  }

  const results = await manager.getRepository(Result).find({
    where: { resultId: In(resultIds) },
  });

  return new Map(results.map((result) => [result.resultId, result]));
}

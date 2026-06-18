import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { AppDataSource } from '../data-source';
import { Task } from '../models/Task';
import { Result } from '../models/Result';
import { Workflow } from '../models/Workflow';
import { TaskRunner } from '../workers/taskRunner';
import { TaskStatus } from '../workers/taskStatus';
import { WorkflowStatus } from './workflowStatus';
import { checkDependencyReadiness } from '../workers/dependencyUtils';
import { finalizeWorkflow } from './finalizeWorkflow';
import { WorkflowFinalResult } from './finalResultBuilder';

const VALID_SQUARE = JSON.stringify({
  type: 'Polygon',
  coordinates: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ],
  ],
});

interface StepSeed {
  taskType: string;
  stepNumber: number;
  geoJson?: string;
  dependsOnStep?: number;
}

async function seedWorkflow(steps: StepSeed[]): Promise<string> {
  const workflow = new Workflow();
  workflow.clientId = 'client-e2e';
  workflow.status = WorkflowStatus.Initial;
  const saved = await AppDataSource.getRepository(Workflow).save(workflow);

  const taskRepo = AppDataSource.getRepository(Task);
  const tasks = steps.map((step) => {
    const task = new Task();
    task.clientId = 'client-e2e';
    task.geoJson = step.geoJson ?? VALID_SQUARE;
    task.status = TaskStatus.Queued;
    task.taskType = step.taskType;
    task.stepNumber = step.stepNumber;
    task.workflow = saved;
    return task;
  });
  const savedTasks = await taskRepo.save(tasks);

  const taskByStep = new Map(savedTasks.map((t) => [t.stepNumber, t]));
  const stepsWithDep = steps.filter((s) => s.dependsOnStep !== undefined);
  for (const step of stepsWithDep) {
    taskByStep.get(step.stepNumber)!.dependsOn = taskByStep.get(
      step.dependsOnStep!,
    )!;
  }
  if (stepsWithDep.length > 0) {
    await taskRepo.save(stepsWithDep.map((s) => taskByStep.get(s.stepNumber)!));
  }

  return saved.workflowId;
}

const MAX_ITERATIONS = 20;

async function runWorkflow(workflowId: string): Promise<void> {
  const taskRepository = AppDataSource.getRepository(Task);
  const resultRepository = AppDataSource.getRepository(Result);
  const runner = new TaskRunner(taskRepository);

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const next = await taskRepository.findOne({
      where: { status: TaskStatus.Queued, workflow: { workflowId } },
      relations: ['workflow', 'dependsOn'],
      order: { stepNumber: 'ASC' },
    });
    if (!next) return;

    const outcome = checkDependencyReadiness(next);
    if (outcome === 'wait') continue;

    if (outcome === 'cascade-fail') {
      const depId = next.dependsOn?.taskId ?? 'unknown';
      next.status = TaskStatus.Failed;
      next.progress = `dependency task ${depId} failed`;
      await taskRepository.save(next);
      await finalizeWorkflow(taskRepository.manager, workflowId);
      continue;
    }

    if (next.dependsOn?.resultId) {
      const depResult = await resultRepository.findOne({
        where: { resultId: next.dependsOn.resultId },
      });
      next.input = depResult?.data ?? null;
    }

    try {
      await runner.run(next);
    } catch {
      // TaskRunner already marked the task Failed and finalized the workflow.
    }
  }
}

async function getFinalResult(
  workflowId: string,
): Promise<{ workflow: Workflow; finalResult: WorkflowFinalResult | null }> {
  const workflow = await AppDataSource.getRepository(Workflow).findOneByOrFail({
    workflowId,
  });
  const finalResult = workflow.finalResult
    ? (JSON.parse(workflow.finalResult) as WorkflowFinalResult)
    : null;
  return { workflow, finalResult };
}

beforeAll(async () => {
  await AppDataSource.initialize();
});

afterAll(async () => {
  await AppDataSource.destroy();
});

beforeEach(async () => {
  await AppDataSource.synchronize(true);
});

describe('Workflow finalResult (e2e)', () => {
  describe('given every task in the workflow completes', () => {
    it('should save a finalResult with all task outputs and Completed status', async () => {
      // Arrange
      const workflowId = await seedWorkflow([
        { taskType: 'polygonArea', stepNumber: 1 },
        { taskType: 'analysis', stepNumber: 2 },
      ]);

      // Act
      await runWorkflow(workflowId);
      const { workflow, finalResult } = await getFinalResult(workflowId);

      // Assert
      expect(workflow.status).toBe(WorkflowStatus.Completed);
      expect(finalResult).not.toBeNull();
      expect(finalResult!.status).toBe(WorkflowStatus.Completed);
      expect(finalResult!.totalTasks).toBe(2);
      expect(finalResult!.completedTasks).toBe(2);
      expect(finalResult!.failedTasks).toBe(0);
      expect(finalResult!.tasks.map((t) => t.type)).toEqual([
        'polygonArea',
        'analysis',
      ]);
      const area = finalResult!.tasks[0].output as { area: number };
      expect(area.area).toBeGreaterThan(0);
    });
  });

  describe('given a task fails directly', () => {
    it('should mark the workflow Failed and record the failure in finalResult', async () => {
      // Arrange — invalid GeoJSON makes the polygonArea task fail.
      const workflowId = await seedWorkflow([
        { taskType: 'polygonArea', stepNumber: 1, geoJson: 'not-json' },
      ]);

      // Act
      await runWorkflow(workflowId);
      const { workflow, finalResult } = await getFinalResult(workflowId);

      // Assert
      expect(workflow.status).toBe(WorkflowStatus.Failed);
      expect(finalResult).not.toBeNull();
      expect(finalResult!.status).toBe(WorkflowStatus.Failed);
      expect(finalResult!.failedTasks).toBe(1);
      const entry = finalResult!.tasks[0];
      expect(entry.status).toBe(TaskStatus.Failed);
      expect(entry.output).toBeNull();
      expect(entry.error).toBeTruthy();
    });
  });

  describe('given a dependency fails and cascades', () => {
    it('should finalize the workflow as Failed with both tasks failed', async () => {
      // Arrange
      const workflowId = await seedWorkflow([
        { taskType: 'polygonArea', stepNumber: 1, geoJson: 'not-json' },
        { taskType: 'analysis', stepNumber: 2, dependsOnStep: 1 },
      ]);

      // Act
      await runWorkflow(workflowId);
      const { workflow, finalResult } = await getFinalResult(workflowId);

      // Assert — without cascade finalization the workflow would be stuck.
      expect(workflow.status).toBe(WorkflowStatus.Failed);
      expect(finalResult!.failedTasks).toBe(2);
      expect(finalResult!.completedTasks).toBe(0);
      expect(finalResult!.tasks.every((t) => t.status === TaskStatus.Failed)).toBe(
        true,
      );
    });
  });
});

import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { AppDataSource } from '../data-source';
import { Task } from '../models/Task';
import { Result } from '../models/Result';
import { Workflow } from '../models/Workflow';
import { TaskRunner } from './taskRunner';
import { TaskStatus } from './taskStatus';
import { WorkflowStatus } from '../workflows/workflowStatus';
import { checkDependencyReadiness } from './dependencyUtils';

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
    const task = taskByStep.get(step.stepNumber)!;
    task.dependsOn = taskByStep.get(step.dependsOnStep!)!;
  }
  if (stepsWithDep.length > 0) {
    await taskRepo.save(stepsWithDep.map((s) => taskByStep.get(s.stepNumber)!));
  }

  return saved.workflowId;
}

/** Safety bound: prevents an infinite loop in the test harness if a `wait`
 *  scenario is ever introduced where no task can make progress. Sized
 *  generously above the largest test workflow (3 tasks × a few polling
 *  iterations = well under 20 rounds). */
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

    if (outcome === 'wait') continue; // mirror production: skip and retry next poll

    if (outcome === 'cascade-fail') {
      const depId = next.dependsOn?.taskId ?? 'unknown';
      next.status = TaskStatus.Failed;
      next.progress = `dependency task ${depId} failed`;
      await taskRepository.save(next);
      continue;
    }

    if (next.dependsOn != null && next.dependsOn.resultId) {
      const depResult = await resultRepository.findOne({
        where: { resultId: next.dependsOn.resultId },
      });
      next.input = depResult?.data ?? null;
    }

    try {
      await runner.run(next);
    } catch {
      // TaskRunner has already marked the task Failed
    }
  }
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

describe('taskWorker dependency support (e2e)', () => {
  describe('given a workflow with no dependencies (null dependsOn)', () => {
    it('should complete all tasks normally', async () => {
      // Arrange
      const workflowId = await seedWorkflow([
        { taskType: 'polygonArea', stepNumber: 1 },
        { taskType: 'analysis', stepNumber: 2 },
      ]);

      // Act
      await runWorkflow(workflowId);

      // Assert
      const tasks = await AppDataSource.getRepository(Task).find({
        where: { workflow: { workflowId } },
        order: { stepNumber: 'ASC' },
      });
      expect(tasks).toHaveLength(2);
      expect(tasks[0].status).toBe(TaskStatus.Completed);
      expect(tasks[1].status).toBe(TaskStatus.Completed);
    });
  });

  describe('given a two-task chain (step 2 dependsOn step 1)', () => {
    it('should complete step 1 first, forward its output to step 2 as input, and persist the consumed output in step 2 result', async () => {
      // Arrange
      const workflowId = await seedWorkflow([
        { taskType: 'polygonArea', stepNumber: 1 },
        { taskType: 'analysis', stepNumber: 2, dependsOnStep: 1 },
      ]);

      // Act
      await runWorkflow(workflowId);

      // Assert — tasks complete and input forwarded
      const tasks = await AppDataSource.getRepository(Task).find({
        where: { workflow: { workflowId } },
        order: { stepNumber: 'ASC' },
      });
      const [step1, step2] = tasks;

      expect(step1.status).toBe(TaskStatus.Completed);
      expect(step2.status).toBe(TaskStatus.Completed);
      expect(step2.input).not.toBeNull();
      const forwarded = JSON.parse(step2.input!);
      expect(forwarded).toHaveProperty('area');
      expect(forwarded.area).toBeGreaterThan(0);

      // Assert — step 2 persisted result actually CONTAINS the forwarded area
      // (proves consumption end-to-end, not just that task.input was set)
      expect(step2.resultId).not.toBeNull();
      const step2Result = await AppDataSource.getRepository(Result).findOne({
        where: { resultId: step2.resultId! },
      });
      expect(step2Result).not.toBeNull();
      const step2Output = JSON.parse(step2Result!.data!);
      expect(step2Output).toHaveProperty('dependency');
      expect(step2Output.dependency).toHaveProperty('area');
      expect(step2Output.dependency.area).toBeGreaterThan(0);
    });
  });

  describe('given a dependency that fails', () => {
    it('should cascade-fail the dependent task without running it', async () => {
      // Arrange
      const workflowId = await seedWorkflow([
        { taskType: 'polygonArea', stepNumber: 1, geoJson: 'not-json' },
        { taskType: 'analysis', stepNumber: 2, dependsOnStep: 1 },
      ]);

      // Act
      await runWorkflow(workflowId);

      // Assert
      const tasks = await AppDataSource.getRepository(Task).find({
        where: { workflow: { workflowId } },
        order: { stepNumber: 'ASC' },
      });
      const [step1, step2] = tasks;

      expect(step1.status).toBe(TaskStatus.Failed);
      expect(step2.status).toBe(TaskStatus.Failed);
      expect(step2.progress).toMatch(/dependency task .+ failed/);
    });
  });

  describe('given a three-task chain (1 -> 2 -> 3)', () => {
    it('should complete all tasks in order and forward outputs through the chain', async () => {
      // Arrange
      const workflowId = await seedWorkflow([
        { taskType: 'polygonArea', stepNumber: 1 },
        { taskType: 'analysis', stepNumber: 2, dependsOnStep: 1 },
        { taskType: 'analysis', stepNumber: 3, dependsOnStep: 2 },
      ]);

      // Act
      await runWorkflow(workflowId);

      // Assert
      const tasks = await AppDataSource.getRepository(Task).find({
        where: { workflow: { workflowId } },
        order: { stepNumber: 'ASC' },
      });

      expect(tasks[0].status).toBe(TaskStatus.Completed);
      expect(tasks[1].status).toBe(TaskStatus.Completed);
      expect(tasks[2].status).toBe(TaskStatus.Completed);
      expect(tasks[1].input).not.toBeNull();
      expect(tasks[2].input).not.toBeNull();
    });
  });
});

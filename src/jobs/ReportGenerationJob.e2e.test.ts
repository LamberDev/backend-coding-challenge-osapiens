import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { AppDataSource } from '../data-source';
import { Task } from '../models/Task';
import { Result } from '../models/Result';
import { Workflow } from '../models/Workflow';
import { TaskRunner } from '../workers/taskRunner';
import { TaskStatus } from '../workers/taskStatus';
import { WorkflowStatus } from '../workflows/workflowStatus';
import { getJobForTaskType } from './JobFactory';
import { ReportGenerationJob } from './ReportGenerationJob';
import type { WorkflowReport } from './reportBuilder';

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
}

/** Seeds a workflow with queued tasks, mirroring WorkflowFactory. */
async function seedWorkflow(steps: StepSeed[]): Promise<string> {
  const workflow = new Workflow();
  workflow.clientId = 'client-e2e';
  workflow.status = WorkflowStatus.Initial;
  const saved = await AppDataSource.getRepository(Workflow).save(workflow);

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
  await AppDataSource.getRepository(Task).save(tasks);

  return saved.workflowId;
}

/** Drives queued tasks in stepNumber order, exactly like taskWorker. */
async function runWorkflow(workflowId: string): Promise<void> {
  const taskRepository = AppDataSource.getRepository(Task);
  const runner = new TaskRunner(taskRepository);

  for (;;) {
    const next = await taskRepository.findOne({
      where: { status: TaskStatus.Queued, workflow: { workflowId } },
      relations: ['workflow'],
      order: { stepNumber: 'ASC' },
    });
    if (!next) {
      return;
    }
    try {
      await runner.run(next);
    } catch {
      // TaskRunner has already marked the task Failed; the worker swallows it too.
    }
  }
}

/** Reads back the report produced for a workflow. */
async function getReport(workflowId: string): Promise<{
  task: Task;
  report: WorkflowReport;
}> {
  const task = await AppDataSource.getRepository(Task).findOneOrFail({
    where: { workflow: { workflowId }, taskType: 'reportGeneration' },
    relations: ['workflow'],
  });
  const result = await AppDataSource.getRepository(Result).findOneOrFail({
    where: { resultId: task.resultId },
  });
  return { task, report: JSON.parse(result.data as string) as WorkflowReport };
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

describe('ReportGenerationJob (e2e)', () => {
  describe('given the JobFactory is asked for the reportGeneration type', () => {
    it('should return a ReportGenerationJob instance', () => {
      // Act
      const job = getJobForTaskType('reportGeneration');

      // Assert
      expect(job).toBeInstanceOf(ReportGenerationJob);
    });
  });

  describe('given a workflow whose preceding tasks all succeed', () => {
    it('should aggregate every preceding output into the report', async () => {
      // Arrange
      const workflowId = await seedWorkflow([
        { taskType: 'polygonArea', stepNumber: 1 },
        { taskType: 'analysis', stepNumber: 2 },
        { taskType: 'reportGeneration', stepNumber: 3 },
      ]);

      // Act
      await runWorkflow(workflowId);
      const { task, report } = await getReport(workflowId);

      // Assert
      expect(task.status).toBe(TaskStatus.Completed);
      const workflow = await AppDataSource.getRepository(
        Workflow,
      ).findOneByOrFail({ workflowId });
      expect(workflow.status).toBe(WorkflowStatus.Completed);
      expect(report.workflowId).toBe(workflowId);
      expect(report.tasks.map((t) => t.type)).toEqual([
        'polygonArea',
        'analysis',
      ]);
      const areaEntry = report.tasks[0];
      expect(areaEntry.status).toBe(TaskStatus.Completed);
      expect((areaEntry.output as { area: number }).area).toBeGreaterThan(0);
      expect(report.finalReport).toMatch(/2 completed, 0 failed/);
    });
  });

  describe('given a preceding task fails', () => {
    it('should still produce a report flagging the failure', async () => {
      // Arrange — invalid GeoJSON makes the polygonArea task fail.
      const workflowId = await seedWorkflow([
        { taskType: 'polygonArea', stepNumber: 1, geoJson: 'not-json' },
        { taskType: 'reportGeneration', stepNumber: 2 },
      ]);

      // Act
      await runWorkflow(workflowId);
      const { task, report } = await getReport(workflowId);

      // Assert
      expect(task.status).toBe(TaskStatus.Completed);
      expect(report.tasks).toHaveLength(1);
      const failedEntry = report.tasks[0];
      expect(failedEntry.type).toBe('polygonArea');
      expect(failedEntry.status).toBe(TaskStatus.Failed);
      expect(failedEntry.output).toBeNull();
      expect(failedEntry.error).toBeTruthy();
      expect(report.finalReport).toMatch(/0 completed, 1 failed/);
    });
  });

  describe('given two workflows run with reports', () => {
    it('should keep each report scoped to its own workflow', async () => {
      // Arrange
      const workflowA = await seedWorkflow([
        { taskType: 'polygonArea', stepNumber: 1 },
        { taskType: 'reportGeneration', stepNumber: 2 },
      ]);
      const workflowB = await seedWorkflow([
        { taskType: 'polygonArea', stepNumber: 1 },
        { taskType: 'reportGeneration', stepNumber: 2 },
      ]);

      // Act
      await runWorkflow(workflowA);
      await runWorkflow(workflowB);
      const reportA = (await getReport(workflowA)).report;
      const reportB = (await getReport(workflowB)).report;

      // Assert — each report aggregates exactly one task, its own.
      expect(reportA.workflowId).toBe(workflowA);
      expect(reportB.workflowId).toBe(workflowB);
      expect(reportA.tasks).toHaveLength(1);
      expect(reportB.tasks).toHaveLength(1);
      expect(reportA.tasks[0].taskId).not.toBe(reportB.tasks[0].taskId);
    });
  });
});

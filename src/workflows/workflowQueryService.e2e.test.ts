import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { AppDataSource } from '../data-source';
import { Task } from '../models/Task';
import { Workflow } from '../models/Workflow';
import { TaskStatus } from '../workers/taskStatus';
import { WorkflowStatus } from './workflowStatus';
import { WorkflowQueryService } from './workflowQueryService';

async function seedWorkflow(statuses: TaskStatus[]): Promise<string> {
  const workflow = new Workflow();
  workflow.clientId = 'client-e2e';
  workflow.status = WorkflowStatus.InProgress;
  const saved = await AppDataSource.getRepository(Workflow).save(workflow);

  const tasks = statuses.map((status, i) => {
    const task = new Task();
    task.clientId = 'client-e2e';
    task.geoJson = '{}';
    task.status = status;
    task.taskType = 'analysis';
    task.stepNumber = i + 1;
    task.workflow = saved;
    return task;
  });
  await AppDataSource.getRepository(Task).save(tasks);

  return saved.workflowId;
}

async function seedFinalized(
  status: WorkflowStatus,
  finalResult: string | null,
): Promise<string> {
  const workflow = new Workflow();
  workflow.clientId = 'client-e2e';
  workflow.status = status;
  workflow.finalResult = finalResult;
  const saved = await AppDataSource.getRepository(Workflow).save(workflow);
  return saved.workflowId;
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

describe('WorkflowQueryService', () => {
  const service = new WorkflowQueryService(AppDataSource);

  describe('given an existing workflow', () => {
    it('should return its status summary with task counts', async () => {
      // Arrange
      const workflowId = await seedWorkflow([
        TaskStatus.Completed,
        TaskStatus.Completed,
        TaskStatus.Queued,
      ]);

      // Act
      const summary = await service.getStatus(workflowId);

      // Assert
      expect(summary).not.toBeNull();
      expect(summary!.workflowId).toBe(workflowId);
      expect(summary!.status).toBe(WorkflowStatus.InProgress);
      expect(summary!.completedTasks).toBe(2);
      expect(summary!.totalTasks).toBe(3);
    });
  });

  describe('given an unknown workflow id', () => {
    it('should return null so the controller can map it to 404', async () => {
      // Arrange
      const unknownId = 'does-not-exist';

      // Act
      const summary = await service.getStatus(unknownId);

      // Assert
      expect(summary).toBeNull();
    });
  });

  describe('getResults', () => {
    describe('given a completed workflow with a persisted finalResult', () => {
      it('should return a ready outcome with the parsed body', async () => {
        // Arrange
        const workflowId = await seedFinalized(
          WorkflowStatus.Completed,
          JSON.stringify({ summary: 'all done', completedTasks: 2 }),
        );

        // Act
        const outcome = await service.getResults(workflowId);

        // Assert
        expect(outcome).toEqual({
          ready: true,
          body: {
            workflowId,
            status: WorkflowStatus.Completed,
            finalResult: { summary: 'all done', completedTasks: 2 },
          },
        });
      });
    });

    describe('given an in_progress workflow', () => {
      it('should return a not-ready outcome', async () => {
        // Arrange
        const workflowId = await seedFinalized(
          WorkflowStatus.InProgress,
          null,
        );

        // Act
        const outcome = await service.getResults(workflowId);

        // Assert
        expect(outcome).toEqual({ ready: false });
      });
    });

    describe('given an unknown workflow id', () => {
      it('should return null so the controller can map it to 404', async () => {
        // Arrange
        const unknownId = 'does-not-exist';

        // Act
        const outcome = await service.getResults(unknownId);

        // Assert
        expect(outcome).toBeNull();
      });
    });
  });
});

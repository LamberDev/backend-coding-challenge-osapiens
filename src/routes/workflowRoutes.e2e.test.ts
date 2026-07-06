import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import { AppDataSource } from '../data-source';
import { Task } from '../models/Task';
import { Workflow } from '../models/Workflow';
import { TaskStatus } from '../workers/taskStatus';
import { WorkflowStatus } from '../workflows/workflowStatus';
import { NextFunction } from 'express';
import { getWorkflowStatus, getWorkflowResults } from './workflowRoutes';
import { HttpError, NotFoundError } from '../http/HttpError';

function makeReq(params: Record<string, string>): Request {
  return { params } as unknown as Request;
}

interface CapturedResponse {
  statusCode: number;
  body: unknown;
}

function makeRes(): { res: Response; captured: CapturedResponse } {
  const captured: CapturedResponse = { statusCode: 200, body: undefined };
  const res = {
    status(code: number) {
      captured.statusCode = code;
      return res;
    },
    json(body: unknown) {
      captured.body = body;
      return res;
    },
  } as unknown as Response;
  return { res, captured };
}

function makeNext(): { next: NextFunction; forwarded: () => unknown } {
  let error: unknown;
  const next = ((err?: unknown) => {
    error = err;
  }) as NextFunction;
  return { next, forwarded: () => error };
}

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

describe('GET /workflow/:id/status (handler)', () => {
  describe('given a seeded workflow with 3 completed and 2 queued tasks', () => {
    it('should respond 200 with workflowId, in_progress status, and counts', async () => {
      // Arrange
      const workflowId = await seedWorkflow([
        TaskStatus.Completed,
        TaskStatus.Completed,
        TaskStatus.Completed,
        TaskStatus.Queued,
        TaskStatus.Queued,
      ]);
      const { res, captured } = makeRes();
      const { next } = makeNext();

      // Act
      await getWorkflowStatus(makeReq({ id: workflowId }), res, next);

      // Assert
      expect(captured.statusCode).toBe(200);
      const body = captured.body as {
        workflowId: string;
        status: string;
        completedTasks: number;
        totalTasks: number;
      };
      expect(body.workflowId).toBe(workflowId);
      expect(body.status).toBe('in_progress');
      expect(body.completedTasks).toBe(3);
      expect(body.totalTasks).toBe(5);
    });
  });

  describe('given an unknown workflow id', () => {
    it('should forward a 404 NotFoundError to the error middleware', async () => {
      // Arrange
      const { res } = makeRes();
      const { next, forwarded } = makeNext();

      // Act
      await getWorkflowStatus(makeReq({ id: 'does-not-exist' }), res, next);

      // Assert
      const error = forwarded();
      expect(error).toBeInstanceOf(NotFoundError);
      expect((error as NotFoundError).statusCode).toBe(404);
      expect((error as NotFoundError).message.length).toBeGreaterThan(0);
    });
  });
});

describe('GET /workflow/:id/results (handler)', () => {
  describe('given a completed workflow with a persisted finalResult', () => {
    it('should respond 200 with the parsed { workflowId, status, finalResult } body', async () => {
      // Arrange
      const workflowId = await seedFinalized(
        WorkflowStatus.Completed,
        JSON.stringify({ summary: 'all done', completedTasks: 2 }),
      );
      const { res, captured } = makeRes();
      const { next } = makeNext();

      // Act
      await getWorkflowResults(makeReq({ id: workflowId }), res, next);

      // Assert
      expect(captured.statusCode).toBe(200);
      expect(captured.body).toEqual({
        workflowId,
        status: WorkflowStatus.Completed,
        finalResult: { summary: 'all done', completedTasks: 2 },
      });
    });
  });

  describe('given an in_progress workflow', () => {
    it('should forward a 400 HttpError to the error middleware', async () => {
      // Arrange
      const workflowId = await seedFinalized(WorkflowStatus.InProgress, null);
      const { res } = makeRes();
      const { next, forwarded } = makeNext();

      // Act
      await getWorkflowResults(makeReq({ id: workflowId }), res, next);

      // Assert
      const error = forwarded();
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).statusCode).toBe(400);
    });
  });

  describe('given a failed workflow with a populated finalResult', () => {
    it('should forward a 400 HttpError and withhold the finalResult', async () => {
      // Arrange
      const workflowId = await seedFinalized(
        WorkflowStatus.Failed,
        JSON.stringify({ summary: 'boom' }),
      );
      const { res, captured } = makeRes();
      const { next, forwarded } = makeNext();

      // Act
      await getWorkflowResults(makeReq({ id: workflowId }), res, next);

      // Assert
      const error = forwarded();
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).statusCode).toBe(400);
      expect(captured.body).toBeUndefined();
    });
  });

  describe('given an unknown workflow id', () => {
    it('should forward a 404 NotFoundError to the error middleware', async () => {
      // Arrange
      const { res } = makeRes();
      const { next, forwarded } = makeNext();

      // Act
      await getWorkflowResults(makeReq({ id: 'does-not-exist' }), res, next);

      // Assert
      const error = forwarded();
      expect(error).toBeInstanceOf(NotFoundError);
      expect((error as NotFoundError).statusCode).toBe(404);
    });
  });
});

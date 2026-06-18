import { describe, it, expect } from 'vitest';
import {
  buildWorkflowFinalResult,
  isTerminalWorkflowStatus,
  resolveWorkflowStatus,
} from './finalResultBuilder';
import { SiblingTask } from './taskOutcome';
import { Task } from '../models/Task';
import { TaskStatus } from '../workers/taskStatus';
import { WorkflowStatus } from './workflowStatus';

const WORKFLOW_ID = 'wf-1';

interface SiblingOptions {
  taskId: string;
  stepNumber: number;
  status: TaskStatus;
  taskType?: string;
  output?: unknown;
}

function makeSibling({
  taskId,
  stepNumber,
  status,
  taskType = 'polygonArea',
  output,
}: SiblingOptions): SiblingTask {
  const task = {
    taskId,
    stepNumber,
    status,
    taskType,
    workflow: { workflowId: WORKFLOW_ID },
  } as Task;

  const result =
    output === undefined
      ? null
      : { resultId: `r-${taskId}`, taskId, data: JSON.stringify(output) };

  return { task, result };
}

describe('resolveWorkflowStatus', () => {
  describe('given any task failed', () => {
    it('should resolve to Failed even if others are still pending', () => {
      const status = resolveWorkflowStatus([
        TaskStatus.Completed,
        TaskStatus.Failed,
        TaskStatus.Queued,
      ]);
      expect(status).toBe(WorkflowStatus.Failed);
    });
  });

  describe('given every task completed', () => {
    it('should resolve to Completed', () => {
      const status = resolveWorkflowStatus([
        TaskStatus.Completed,
        TaskStatus.Completed,
      ]);
      expect(status).toBe(WorkflowStatus.Completed);
    });
  });

  describe('given a mix of completed and pending (no failures)', () => {
    it('should resolve to InProgress', () => {
      const status = resolveWorkflowStatus([
        TaskStatus.Completed,
        TaskStatus.InProgress,
      ]);
      expect(status).toBe(WorkflowStatus.InProgress);
    });
  });
});

describe('isTerminalWorkflowStatus', () => {
  it('should be true for Completed and Failed, false otherwise', () => {
    expect(isTerminalWorkflowStatus(WorkflowStatus.Completed)).toBe(true);
    expect(isTerminalWorkflowStatus(WorkflowStatus.Failed)).toBe(true);
    expect(isTerminalWorkflowStatus(WorkflowStatus.InProgress)).toBe(false);
    expect(isTerminalWorkflowStatus(WorkflowStatus.Initial)).toBe(false);
  });
});

describe('buildWorkflowFinalResult', () => {
  describe('given every task completed', () => {
    it('should aggregate ALL task outputs with counts and a summary', () => {
      // Arrange
      const siblings = [
        makeSibling({
          taskId: 'area',
          stepNumber: 1,
          status: TaskStatus.Completed,
          taskType: 'polygonArea',
          output: { area: 1234 },
        }),
        makeSibling({
          taskId: 'report',
          stepNumber: 2,
          status: TaskStatus.Completed,
          taskType: 'reportGeneration',
          output: { finalReport: 'done' },
        }),
      ];

      // Act
      const result = buildWorkflowFinalResult(
        WORKFLOW_ID,
        WorkflowStatus.Completed,
        siblings,
      );

      // Assert — includes the report task itself, unlike the report.
      expect(result.workflowId).toBe(WORKFLOW_ID);
      expect(result.status).toBe(WorkflowStatus.Completed);
      expect(result.totalTasks).toBe(2);
      expect(result.completedTasks).toBe(2);
      expect(result.failedTasks).toBe(0);
      expect(result.tasks).toEqual([
        {
          taskId: 'area',
          type: 'polygonArea',
          status: TaskStatus.Completed,
          output: { area: 1234 },
        },
        {
          taskId: 'report',
          type: 'reportGeneration',
          status: TaskStatus.Completed,
          output: { finalReport: 'done' },
        },
      ]);
      expect(result.summary).toMatch(/2\/2 task\(s\) completed, 0 failed/);
    });
  });

  describe('given a failed task', () => {
    it('should include the failure with an error note and count it', () => {
      // Arrange
      const siblings = [
        makeSibling({
          taskId: 'ok',
          stepNumber: 1,
          status: TaskStatus.Completed,
          output: { area: 1 },
        }),
        makeSibling({
          taskId: 'broken',
          stepNumber: 2,
          status: TaskStatus.Failed,
        }),
      ];

      // Act
      const result = buildWorkflowFinalResult(
        WORKFLOW_ID,
        WorkflowStatus.Failed,
        siblings,
      );

      // Assert
      expect(result.status).toBe(WorkflowStatus.Failed);
      expect(result.completedTasks).toBe(1);
      expect(result.failedTasks).toBe(1);
      const failed = result.tasks[1];
      expect(failed.status).toBe(TaskStatus.Failed);
      expect(failed.output).toBeNull();
      expect(failed.error).toMatch(/failed/i);
      expect(result.summary).toMatch(/1\/2 task\(s\) completed, 1 failed/);
    });
  });

  describe('given no tasks', () => {
    it('should produce an empty, zeroed final result', () => {
      const result = buildWorkflowFinalResult(
        WORKFLOW_ID,
        WorkflowStatus.Completed,
        [],
      );
      expect(result.tasks).toEqual([]);
      expect(result.totalTasks).toBe(0);
      expect(result.summary).toMatch(/0\/0 task\(s\) completed, 0 failed/);
    });
  });
});

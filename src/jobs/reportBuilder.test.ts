import { describe, it, expect } from 'vitest';
import {
  buildWorkflowReport,
  selectPrecedingTasks,
  validatePrecedingTasksSettled,
  SiblingTask,
} from './reportBuilder';
import { Task } from '../models/Task';
import { TaskStatus } from '../workers/taskStatus';

const WORKFLOW_ID = 'wf-1';

interface SiblingOptions {
  taskId: string;
  stepNumber: number;
  status: TaskStatus;
  taskType?: string;
  output?: unknown;
}

/** Builds a SiblingTask whose Result mirrors how TaskRunner persists output. */
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

function makeReportTask(stepNumber: number, taskId = 'report'): Task {
  return {
    taskId,
    stepNumber,
    taskType: 'reportGeneration',
    status: TaskStatus.InProgress,
    workflow: { workflowId: WORKFLOW_ID },
  } as Task;
}

describe('selectPrecedingTasks', () => {
  describe('given siblings that include the report task and a later task', () => {
    it('should return only lower-stepNumber tasks, excluding the report itself, sorted ascending', () => {
      // Arrange
      const reportTask = makeReportTask(3);
      const siblings = [
        makeSibling({
          taskId: 'b',
          stepNumber: 2,
          status: TaskStatus.Completed,
        }),
        makeSibling({
          taskId: 'a',
          stepNumber: 1,
          status: TaskStatus.Completed,
        }),
        { task: reportTask, result: null },
        makeSibling({
          taskId: 'late',
          stepNumber: 4,
          status: TaskStatus.Queued,
        }),
      ];

      // Act
      const preceding = selectPrecedingTasks(siblings, reportTask);

      // Assert
      expect(preceding.map((s) => s.task.taskId)).toEqual(['a', 'b']);
    });
  });
});

describe('validatePrecedingTasksSettled', () => {
  describe('given every preceding task is completed or failed', () => {
    it('should not throw', () => {
      // Arrange
      const preceding = [
        makeSibling({
          taskId: 'a',
          stepNumber: 1,
          status: TaskStatus.Completed,
        }),
        makeSibling({ taskId: 'b', stepNumber: 2, status: TaskStatus.Failed }),
      ];

      // Act + Assert
      expect(() => validatePrecedingTasksSettled(preceding)).not.toThrow();
    });
  });

  describe('given a preceding task is still queued', () => {
    it('should throw naming the unsettled task', () => {
      // Arrange
      const preceding = [
        makeSibling({
          taskId: 'a',
          stepNumber: 1,
          status: TaskStatus.Completed,
        }),
        makeSibling({
          taskId: 'pending',
          stepNumber: 2,
          status: TaskStatus.Queued,
        }),
      ];

      // Act + Assert
      expect(() => validatePrecedingTasksSettled(preceding)).toThrow(/pending/);
    });
  });

  describe('given a preceding task is still in progress', () => {
    it('should throw', () => {
      // Arrange
      const preceding = [
        makeSibling({
          taskId: 'a',
          stepNumber: 1,
          status: TaskStatus.InProgress,
        }),
      ];

      // Act + Assert
      expect(() => validatePrecedingTasksSettled(preceding)).toThrow(
        /not settled/i,
      );
    });
  });
});

describe('buildWorkflowReport', () => {
  describe('given all preceding tasks completed', () => {
    it('should aggregate their outputs in stepNumber order with a summary', () => {
      // Arrange
      const reportTask = makeReportTask(3);
      const siblings = [
        makeSibling({
          taskId: 'area',
          stepNumber: 1,
          status: TaskStatus.Completed,
          taskType: 'polygonArea',
          output: { area: 1234 },
        }),
        makeSibling({
          taskId: 'analysis',
          stepNumber: 2,
          status: TaskStatus.Completed,
          taskType: 'analysis',
          output: 'No country found',
        }),
        { task: reportTask, result: null },
      ];

      // Act
      const report = buildWorkflowReport(reportTask, siblings);

      // Assert
      expect(report.workflowId).toBe(WORKFLOW_ID);
      expect(report.tasks).toEqual([
        {
          taskId: 'area',
          type: 'polygonArea',
          status: TaskStatus.Completed,
          output: { area: 1234 },
        },
        {
          taskId: 'analysis',
          type: 'analysis',
          status: TaskStatus.Completed,
          output: 'No country found',
        },
      ]);
      expect(report.finalReport).toMatch(/2 completed, 0 failed/);
    });
  });

  describe('given a preceding task failed', () => {
    it('should include the failed task with a null output and an error note', () => {
      // Arrange
      const reportTask = makeReportTask(2);
      const siblings = [
        makeSibling({
          taskId: 'broken',
          stepNumber: 1,
          status: TaskStatus.Failed,
          taskType: 'polygonArea',
        }),
        { task: reportTask, result: null },
      ];

      // Act
      const report = buildWorkflowReport(reportTask, siblings);

      // Assert
      const entry = report.tasks[0];
      expect(entry.status).toBe(TaskStatus.Failed);
      expect(entry.output).toBeNull();
      expect(entry.error).toMatch(/failed/i);
      expect(report.finalReport).toMatch(/0 completed, 1 failed/);
    });
  });

  describe('given a preceding task is not yet settled', () => {
    it('should throw so TaskRunner marks the report as Failed', () => {
      // Arrange
      const reportTask = makeReportTask(2);
      const siblings = [
        makeSibling({
          taskId: 'queued',
          stepNumber: 1,
          status: TaskStatus.Queued,
        }),
        { task: reportTask, result: null },
      ];

      // Act + Assert
      expect(() => buildWorkflowReport(reportTask, siblings)).toThrow(
        /not settled/i,
      );
    });
  });

  describe('given there are no preceding tasks', () => {
    it('should return an empty task list with a zero summary', () => {
      // Arrange
      const reportTask = makeReportTask(1);
      const siblings = [{ task: reportTask, result: null }];

      // Act
      const report = buildWorkflowReport(reportTask, siblings);

      // Assert
      expect(report.tasks).toEqual([]);
      expect(report.finalReport).toMatch(
        /0 preceding task\(s\): 0 completed, 0 failed/,
      );
    });
  });

  describe('given a completed task whose result row is missing', () => {
    it('should record a null output rather than crash', () => {
      // Arrange
      const reportTask = makeReportTask(2);
      const siblings = [
        makeSibling({
          taskId: 'a',
          stepNumber: 1,
          status: TaskStatus.Completed,
        }),
        { task: reportTask, result: null },
      ];

      // Act
      const report = buildWorkflowReport(reportTask, siblings);

      // Assert
      expect(report.tasks[0].output).toBeNull();
    });
  });
});

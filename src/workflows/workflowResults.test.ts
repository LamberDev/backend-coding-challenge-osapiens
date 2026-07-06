import { describe, it, expect } from 'vitest';
import { resolveWorkflowResults } from './workflowResults';
import { WorkflowStatus } from './workflowStatus';

describe('resolveWorkflowResults', () => {
  describe('given a completed workflow with a JSON-stringified finalResult', () => {
    it('should ready with the parsed object as finalResult', () => {
      // Arrange
      const raw = JSON.stringify({ summary: 'done', completedTasks: 2 });

      // Act
      const outcome = resolveWorkflowResults(
        'wf-1',
        WorkflowStatus.Completed,
        raw,
      );

      // Assert
      expect(outcome).toEqual({
        ready: true,
        body: {
          workflowId: 'wf-1',
          status: WorkflowStatus.Completed,
          finalResult: { summary: 'done', completedTasks: 2 },
        },
      });
    });
  });

  describe('given a non-completed workflow', () => {
    it('should withhold when status is in_progress', () => {
      // Arrange
      const status = WorkflowStatus.InProgress;

      // Act
      const outcome = resolveWorkflowResults('wf-2', status, null);

      // Assert
      expect(outcome).toEqual({ ready: false });
    });

    it('should withhold when status is initial', () => {
      // Arrange
      const status = WorkflowStatus.Initial;

      // Act
      const outcome = resolveWorkflowResults('wf-3', status, null);

      // Assert
      expect(outcome).toEqual({ ready: false });
    });

    it('should withhold when status is failed even with a populated finalResult', () => {
      // Arrange
      const raw = JSON.stringify({ summary: 'boom' });

      // Act
      const outcome = resolveWorkflowResults(
        'wf-4',
        WorkflowStatus.Failed,
        raw,
      );

      // Assert
      expect(outcome).toEqual({ ready: false });
    });
  });

  describe('given a completed workflow with a malformed finalResult string', () => {
    it('should ready with the raw string as finalResult (fallback)', () => {
      // Arrange
      const raw = 'legacy-plain-string';

      // Act
      const outcome = resolveWorkflowResults(
        'wf-5',
        WorkflowStatus.Completed,
        raw,
      );

      // Assert
      expect(outcome).toEqual({
        ready: true,
        body: {
          workflowId: 'wf-5',
          status: WorkflowStatus.Completed,
          finalResult: 'legacy-plain-string',
        },
      });
    });
  });

  describe('given a completed workflow with a null finalResult', () => {
    it('should ready with finalResult null (trust the status column)', () => {
      // Arrange
      const raw = null;

      // Act
      const outcome = resolveWorkflowResults(
        'wf-6',
        WorkflowStatus.Completed,
        raw,
      );

      // Assert
      expect(outcome).toEqual({
        ready: true,
        body: {
          workflowId: 'wf-6',
          status: WorkflowStatus.Completed,
          finalResult: null,
        },
      });
    });
  });
});

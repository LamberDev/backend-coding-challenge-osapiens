import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { summarizeWorkflow } from './workflowStatusSummary';
import { TaskStatus } from '../workers/taskStatus';

describe('summarizeWorkflow', () => {
  describe('given mixed statuses [completed, completed, queued]', () => {
    it('should return in_progress with 2 completed out of 3', () => {
      // Arrange
      const statuses = [
        TaskStatus.Completed,
        TaskStatus.Completed,
        TaskStatus.Queued,
      ];

      // Act
      const result = summarizeWorkflow('wf-1', statuses);

      // Assert
      expect(result.workflowId).toBe('wf-1');
      expect(result.status).toBe('in_progress');
      expect(result.completedTasks).toBe(2);
      expect(result.totalTasks).toBe(3);
    });
  });

  describe('given all tasks completed', () => {
    it('should return completed with completedTasks equal to totalTasks', () => {
      // Arrange
      const statuses = [TaskStatus.Completed, TaskStatus.Completed];

      // Act
      const result = summarizeWorkflow('wf-2', statuses);

      // Assert
      expect(result.status).toBe('completed');
      expect(result.completedTasks).toBe(2);
      expect(result.totalTasks).toBe(2);
    });
  });

  describe('given at least one failed task', () => {
    it('should return failed and count only completed tasks', () => {
      // Arrange
      const statuses = [
        TaskStatus.Completed,
        TaskStatus.Failed,
        TaskStatus.Completed,
      ];

      // Act
      const result = summarizeWorkflow('wf-3', statuses);

      // Assert
      expect(result.status).toBe('failed');
      expect(result.completedTasks).toBe(2);
      expect(result.totalTasks).toBe(3);
    });
  });

  describe('given an empty task list', () => {
    it('should return completed with 0/0', () => {
      // Arrange
      const statuses: TaskStatus[] = [];

      // Act
      const result = summarizeWorkflow('wf-4', statuses);

      // Assert
      expect(result.workflowId).toBe('wf-4');
      expect(result.status).toBe('completed');
      expect(result.completedTasks).toBe(0);
      expect(result.totalTasks).toBe(0);
    });
  });
});

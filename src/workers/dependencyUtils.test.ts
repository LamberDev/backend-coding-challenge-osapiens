import { describe, it, expect } from 'vitest';
import { checkDependencyReadiness, detectCycle } from './dependencyUtils';
import { Task } from '../models/Task';
import { TaskStatus } from './taskStatus';
import type { WorkflowStep } from '../workflows/WorkflowFactory';

function makeTask(status: TaskStatus): Task {
  return { status } as Task;
}

function makeTaskWithDep(status: TaskStatus, dep: Task | null): Task {
  return { status, dependsOn: dep } as unknown as Task;
}

describe('checkDependencyReadiness', () => {
  describe('given a task with no dependency (dependsOn is null)', () => {
    it('should return ready', () => {
      const task = makeTaskWithDep(TaskStatus.Queued, null);
      expect(checkDependencyReadiness(task)).toBe('ready');
    });
  });

  describe('given a task with no dependency (dependsOn is undefined)', () => {
    it('should return ready', () => {
      const task = makeTask(TaskStatus.Queued);
      expect(checkDependencyReadiness(task)).toBe('ready');
    });
  });

  describe('given a task whose dependency is Completed', () => {
    it('should return ready', () => {
      const dep = makeTask(TaskStatus.Completed);
      const task = makeTaskWithDep(TaskStatus.Queued, dep);
      expect(checkDependencyReadiness(task)).toBe('ready');
    });
  });

  describe('given a task whose dependency is Failed', () => {
    it('should return cascade-fail', () => {
      const dep = makeTask(TaskStatus.Failed);
      const task = makeTaskWithDep(TaskStatus.Queued, dep);
      expect(checkDependencyReadiness(task)).toBe('cascade-fail');
    });
  });

  describe('given a task whose dependency is Queued', () => {
    it('should return wait', () => {
      const dep = makeTask(TaskStatus.Queued);
      const task = makeTaskWithDep(TaskStatus.Queued, dep);
      expect(checkDependencyReadiness(task)).toBe('wait');
    });
  });

  describe('given a task whose dependency is InProgress', () => {
    it('should return wait', () => {
      const dep = makeTask(TaskStatus.InProgress);
      const task = makeTaskWithDep(TaskStatus.Queued, dep);
      expect(checkDependencyReadiness(task)).toBe('wait');
    });
  });
});

describe('detectCycle', () => {
  describe('given a linear chain [1 → none, 2 → 1, 3 → 2]', () => {
    it('should not throw', () => {
      const steps: WorkflowStep[] = [
        { taskType: 'a', stepNumber: 1 },
        { taskType: 'b', stepNumber: 2, dependsOn: 1 },
        { taskType: 'c', stepNumber: 3, dependsOn: 2 },
      ];
      expect(() => detectCycle(steps)).not.toThrow();
    });
  });

  describe('given a direct cycle [1 → 2, 2 → 1]', () => {
    it('should throw', () => {
      const steps: WorkflowStep[] = [
        { taskType: 'a', stepNumber: 1, dependsOn: 2 },
        { taskType: 'b', stepNumber: 2, dependsOn: 1 },
      ];
      expect(() => detectCycle(steps)).toThrow(/cycle/i);
    });
  });

  describe('given a self-cycle [1 → 1]', () => {
    it('should throw', () => {
      const steps: WorkflowStep[] = [
        { taskType: 'a', stepNumber: 1, dependsOn: 1 },
      ];
      expect(() => detectCycle(steps)).toThrow(/cycle/i);
    });
  });

  describe('given a reference to a non-existent stepNumber', () => {
    it('should throw', () => {
      const steps: WorkflowStep[] = [
        { taskType: 'a', stepNumber: 1, dependsOn: 99 },
      ];
      expect(() => detectCycle(steps)).toThrow(/unknown.*step|step.*unknown|not found|does not exist/i);
    });
  });

  describe('given steps without dependencies (no dependsOn fields)', () => {
    it('should not throw', () => {
      const steps: WorkflowStep[] = [
        { taskType: 'a', stepNumber: 1 },
        { taskType: 'b', stepNumber: 2 },
      ];
      expect(() => detectCycle(steps)).not.toThrow();
    });
  });
});

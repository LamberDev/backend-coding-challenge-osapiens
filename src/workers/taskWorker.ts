import { AppDataSource } from '../data-source';
import { Task } from '../models/Task';
import { TaskRunner, TaskStatus } from './taskRunner';
import { Result } from '../models/Result';
import { checkDependencyReadiness } from './dependencyUtils';
import { config } from '../config/env';

async function cascadeFailTask(
  task: Task,
  taskRepository: ReturnType<typeof AppDataSource.getRepository<Task>>,
): Promise<void> {
  const depId = task.dependsOn?.taskId ?? 'unknown';
  task.status = TaskStatus.Failed;
  task.progress = `dependency task ${depId} failed`;
  await taskRepository.save(task);
}

async function forwardDependencyInput(task: Task): Promise<void> {
  const dep = task.dependsOn;
  if (dep == null || !dep.resultId) return;

  const resultRepository = AppDataSource.getRepository(Result);
  const depResult = await resultRepository.findOne({
    where: { resultId: dep.resultId },
  });
  task.input = depResult?.data ?? null;
}

async function dispatchReadyTask(
  task: Task,
  taskRunner: TaskRunner,
): Promise<void> {
  await forwardDependencyInput(task);
  try {
    await taskRunner.run(task);
  } catch (error) {
    console.error(
      'Task execution failed. Task status has already been updated by TaskRunner.',
    );
    console.error(error);
  }
}

export async function taskWorker() {
  const taskRepository = AppDataSource.getRepository(Task);
  const taskRunner = new TaskRunner(taskRepository);

  while (true) {
    const task = await taskRepository.findOne({
      where: { status: TaskStatus.Queued },
      relations: ['workflow', 'dependsOn'],
      order: { stepNumber: 'ASC' },
    });

    if (task) {
      const outcome = checkDependencyReadiness(task);
      if (outcome === 'cascade-fail') await cascadeFailTask(task, taskRepository);
      if (outcome === 'ready') await dispatchReadyTask(task, taskRunner);
    }

    // Wait before checking for the next task again
    await new Promise((resolve) =>
      setTimeout(resolve, config.workerPollIntervalMs),
    );
  }
}

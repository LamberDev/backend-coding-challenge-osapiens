import { TaskStatus } from './taskStatus';
import { Repository } from 'typeorm';
import { Task } from '../models/Task';
import { getJobForTaskType } from '../jobs/JobFactory';
import { Result } from '../models/Result';
import { finalizeWorkflow } from '../workflows/finalizeWorkflow';
export { TaskStatus };

export class TaskRunner {
  constructor(private taskRepository: Repository<Task>) {}

  /**
   * Runs the appropriate job based on the task's type, managing the task's
   * status, then finalizes the owning workflow.
   * @throws If the job fails, it rethrows the error.
   */
  async run(task: Task): Promise<void> {
    task.status = TaskStatus.InProgress;
    task.progress = 'starting job...';
    await this.taskRepository.save(task);
    const job = getJobForTaskType(task.taskType);

    try {
      console.log(`Starting job ${task.taskType} for task ${task.taskId}...`);
      const resultRepository =
        this.taskRepository.manager.getRepository(Result);
      const taskResult = await job.run(task);
      console.log(
        `Job ${task.taskType} for task ${task.taskId} completed successfully.`,
      );
      const result = new Result();
      result.taskId = task.taskId!;
      result.data = JSON.stringify(taskResult || {});
      await resultRepository.save(result);
      task.resultId = result.resultId!;
      task.status = TaskStatus.Completed;
      task.progress = null;
      await this.taskRepository.save(task);
    } catch (error: any) {
      console.error(
        `Error running job ${task.taskType} for task ${task.taskId}:`,
        error,
      );

      task.status = TaskStatus.Failed;
      task.progress = null;
      await this.taskRepository.save(task);

      // Finalize on failure too, so a workflow whose last task fails is not
      // left stuck in_progress.
      await finalizeWorkflow(
        this.taskRepository.manager,
        task.workflow.workflowId,
      );

      throw error;
    }

    await finalizeWorkflow(
      this.taskRepository.manager,
      task.workflow.workflowId,
    );
  }
}

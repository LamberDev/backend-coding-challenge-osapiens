import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { DataSource } from 'typeorm';
import { Workflow } from '../models/Workflow';
import { Task } from '../models/Task';
import { TaskStatus } from '../workers/taskStatus';
import { WorkflowStatus } from './workflowStatus';
import { detectCycle } from '../workers/dependencyUtils';
export { WorkflowStatus };

export interface WorkflowStep {
  taskType: string;
  stepNumber: number;
  dependsOn?: number;
}

interface WorkflowDefinition {
  name: string;
  steps: WorkflowStep[];
}

export class WorkflowFactory {
  constructor(private dataSource: DataSource) {}

  /**
   * Creates a workflow by reading a YAML file and constructing the Workflow and Task entities.
   * @param filePath - Path to the YAML file.
   * @param clientId - Client identifier for the workflow.
   * @param geoJson - The geoJson data string for tasks (customize as needed).
   * @returns A promise that resolves to the created Workflow.
   */
  async createWorkflowFromYAML(
    filePath: string,
    clientId: string,
    geoJson: string,
  ): Promise<Workflow> {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const workflowDef = yaml.load(fileContent) as WorkflowDefinition;

    detectCycle(workflowDef.steps);

    const workflowRepository = this.dataSource.getRepository(Workflow);
    const taskRepository = this.dataSource.getRepository(Task);
    const workflow = new Workflow();

    workflow.clientId = clientId;
    workflow.status = WorkflowStatus.Initial;

    const savedWorkflow = await workflowRepository.save(workflow);

    const tasks: Task[] = workflowDef.steps.map((step) => {
      const task = new Task();
      task.clientId = clientId;
      task.geoJson = geoJson;
      task.status = TaskStatus.Queued;
      task.taskType = step.taskType;
      task.stepNumber = step.stepNumber;
      task.workflow = savedWorkflow;
      return task;
    });

    const savedTasks = await taskRepository.save(tasks);
    
    const taskByStepNumber = new Map(savedTasks.map((t) => [t.stepNumber, t]));
    const stepsWithDep = workflowDef.steps.filter(
      (s) => s.dependsOn !== undefined,
    );

    if (stepsWithDep.length > 0) {
      for (const step of stepsWithDep) {
        const task = taskByStepNumber.get(step.stepNumber)!;
        task.dependsOn = taskByStepNumber.get(step.dependsOn!)!;
      }
      await taskRepository.save(
        stepsWithDep.map((s) => taskByStepNumber.get(s.stepNumber)!),
      );
    }

    return savedWorkflow;
  }
}

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Workflow } from './Workflow';
import { TaskStatus } from '../workers/taskStatus';

@Entity({ name: 'tasks' })
export class Task {
  @PrimaryGeneratedColumn('uuid')
  taskId!: string;

  @Column()
  clientId!: string;

  @Column('text')
  geoJson!: string;

  @Column({ type: 'varchar' })
  status!: TaskStatus;

  @Column({ nullable: true, type: 'text' })
  progress?: string | null;

  @Column({ nullable: true })
  resultId?: string;

  @Column()
  taskType!: string;

  @Column({ default: 1 })
  stepNumber!: number;
  
  @Column({ type: 'text', nullable: true })
  input?: string | null;

  @ManyToOne(() => Workflow, (workflow) => workflow.tasks)
  workflow!: Workflow;

  @ManyToOne(() => Task, { nullable: true, eager: false })
  @JoinColumn({ name: 'dependsOn_task_id' })
  dependsOn?: Task | null;
}
